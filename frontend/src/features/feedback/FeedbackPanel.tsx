import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileCheck2,
  FileEdit,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CitationDto, FeedbackAction, SourceDto } from "../../types/domain";
import { streamFeedback } from "../../services/api";
import { citationTooltip, formatCitationLabel, sortCitations } from "../../lib/citations";
import { cn } from "../../lib/utils";

const ACTIONS: {
  id: FeedbackAction;
  label: string;
  busyLabel: string;
  summary: string;
  description: string;
  icon: typeof Sparkles;
  needsDraft: boolean;
}[] = [
  {
    id: "compose",
    label: "Opstellen",
    busyLabel: "Opstellen…",
    summary: "Nieuw concept vanuit de bronnen.",
    description: "Genereer nieuwe conceptfeedback op basis van de aangevinkte bronnen",
    icon: Sparkles,
    needsDraft: false,
  },
  {
    id: "expand",
    label: "Aanvullen",
    busyLabel: "Aanvullen…",
    summary: "Werkt je eigen steekwoorden uit met voorbeelden en bronverwijzingen.",
    description: "Werk je eigen steekwoorden of korte punten in het tekstvak uit met voorbeelden en bronverwijzingen",
    icon: Wand2,
    needsDraft: true,
  },
  {
    id: "rewrite",
    label: "Herschrijven",
    busyLabel: "Herschrijven…",
    summary: "Polijst je eigen concepttekst: scherper, constructiever en beter gestructureerd.",
    description: "Herschrijf je concepttekst scherper, constructiever en goed gestructureerd",
    icon: FileEdit,
    needsDraft: true,
  },
];

const SOURCES_COLLAPSED_KEY = "review-assistant-feedback-sources-collapsed";

interface Props {
  sessionId: string | null;
  conversationId: string | null;
  conversationTitle: string;
  model: string | null;
  sources: SourceDto[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveDraft: (value?: string) => void;
  onCitationClick: (citation: CitationDto) => void;
  onRenameConversation: (title: string) => void;
  selection?: { text: string; chunkId?: string };
  onClearSelection: () => void;
}

export function FeedbackPanel({
  sessionId,
  conversationId,
  conversationTitle,
  model,
  sources,
  draft,
  onDraftChange,
  onSaveDraft,
  onCitationClick,
  onRenameConversation,
  selection,
  onClearSelection,
}: Props) {
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [busyAction, setBusyAction] = useState<FeedbackAction | null>(null);
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [citations, setCitations] = useState<CitationDto[]>([]);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [action, setAction] = useState<FeedbackAction>("compose");
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(
    () => localStorage.getItem(SOURCES_COLLAPSED_KEY) !== "0",
  );

  // Keep selectedSourceIds in sync when session sources change (default: all attached sources selected)
  useEffect(() => {
    setSelectedSourceIds((prev) => {
      const validIds = sources.map((s) => s.id);
      if (prev.length === 0) return validIds;
      const kept = prev.filter((id) => validIds.includes(id));
      const added = validIds.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [sources]);

  useEffect(() => {
    setPreviousDraft(null);
    setCitations([]);
    setError(null);
    setContextLabel(null);
  }, [sessionId, conversationId]);

  useEffect(() => {
    setTitleDraft(conversationTitle);
  }, [conversationId, conversationTitle]);

  const studentSources = sources.filter((s) => !s.isReference);
  const referenceSources = sources.filter((s) => s.isReference);
  const activeReadyCount = sources.filter(
    (s) => selectedSourceIds.includes(s.id) && s.status === "ready",
  ).length;
  const canGenerate = Boolean(sessionId && model && activeReadyCount > 0 && !busyAction);
  const activeAction = ACTIONS.find((a) => a.id === action) ?? ACTIONS[0];
  const canRun = canGenerate && (!activeAction.needsDraft || Boolean(draft.trim()));
  const busyLabel = ACTIONS.find((a) => a.id === busyAction)?.busyLabel;
  const selectedCount = sources.filter((s) => selectedSourceIds.includes(s.id)).length;
  const ActionIcon = activeAction.icon;

  function toggleSource(id: string) {
    setSelectedSourceIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((item) => item !== id);
        return next.length === 0 ? prev : next;
      }
      return [...prev, id];
    });
  }

  async function runAction(action: FeedbackAction) {
    if (!sessionId || !model || !canGenerate) return;
    if ((action === "expand" || action === "rewrite") && !draft.trim()) {
      setError("Typ eerst steekwoorden of concepttekst in het feedbackveld.");
      return;
    }

    const snapshotBefore = draft;
    setPreviousDraft(snapshotBefore);
    setBusyAction(action);
    setViewMode("preview");
    setError(null);
    setCitations([]);

    let streamed = "";
    try {
      await streamFeedback(
        sessionId,
        {
          action,
          draft: snapshotBefore,
          instructions: instructions.trim() || undefined,
          model,
          conversationId,
          selection: selection?.text,
          sourceIds: selectedSourceIds,
        },
        (type, data) => {
          if (type === "token" && data && typeof data === "object" && "text" in data) {
            streamed += String((data as { text: string }).text);
            onDraftChange(streamed);
          }
          if (type === "context" && data && typeof data === "object") {
            const count = "sourceCount" in data ? Number((data as { sourceCount: number }).sourceCount) : 1;
            const strategy =
              "strategy" in data ? String((data as { strategy: string }).strategy) : "full_document";
            const refCount = sources.filter(
              (s) => selectedSourceIds.includes(s.id) && s.isReference && s.status === "ready",
            ).length;
            if (strategy === "retrieved_references") {
              setContextLabel("Studentenwerk volledig + relevante kaderpassages");
            } else if (refCount > 0) {
              setContextLabel(
                `Gebaseerd op ${count - refCount} studentbron(nen) + ${refCount} kader(s)`,
              );
            } else {
              setContextLabel(
                `Gebaseerd op ${count} bron(nen) (puur LLM, zonder extra kaders)`,
              );
            }
          }
          if (type === "citations" && data && typeof data === "object" && "items" in data) {
            setCitations((data as { items: CitationDto[] }).items);
          }
          if (type === "done" && streamed.trim()) {
            onSaveDraft(streamed);
          }
          if (type === "error" && data && typeof data === "object" && "message" in data) {
            setError(String((data as { message: string }).message));
            onDraftChange(snapshotBefore);
          }
        },
      );
      onClearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback genereren mislukt");
      onDraftChange(snapshotBefore);
    } finally {
      setBusyAction(null);
    }
  }

  function handleUndo() {
    if (previousDraft === null) return;
    onDraftChange(previousDraft);
    onSaveDraft(previousDraft);
    setPreviousDraft(null);
  }

  async function handleCopy() {
    if (!draft.trim()) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/20">
      {/* Context & controls header */}
      <div className="border-b border-slate-800 bg-slate-900/90 px-3 py-2 space-y-1.5 shrink-0">
        {/* Row 1: Conversation Title + Action selector */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <FileEdit className="w-4 h-4 text-amber-500/80 shrink-0" aria-hidden />
            <input
              className="w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-950 border border-transparent focus:border-slate-700 rounded px-1.5 py-0.5 text-sm font-semibold text-slate-100 outline-none transition-colors truncate"
              value={titleDraft}
              disabled={!conversationId}
              placeholder="Gesprekstitel…"
              aria-label="Gesprekstitel"
              title="Deze feedback hoort bij dit gesprek. Klik om de titel aan te passen."
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const next = titleDraft.trim();
                if (next && next !== conversationTitle) onRenameConversation(next);
                else setTitleDraft(conversationTitle);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>

          <div className="flex items-center bg-slate-950/80 p-0.5 rounded-md border border-slate-800 shrink-0">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => setAction(a.id)}
                title={a.description}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  action === a.id
                    ? "bg-amber-600 text-white font-medium shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action explanation line */}
        <p className="text-[11px] text-slate-400 text-right leading-tight">
          <span className="text-amber-400/90 font-medium">{activeAction.label}:</span> {activeAction.summary}
        </p>

        {/* Row 2: Context sources */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 pt-0.5">
          {sources.length === 0 ? (
            <span className="text-xs text-slate-500">Geen bronnen gekoppeld</span>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  setSourcesCollapsed((value) => {
                    localStorage.setItem(SOURCES_COLLAPSED_KEY, value ? "0" : "1");
                    return !value;
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 mr-0.5 transition-colors"
                title={
                  referenceSources.length === 0
                    ? "Geen referentie (puur LLM). Klik op 'Referentie' op een brontab om bijv. HBO-i of beleid als context mee te nemen."
                    : sourcesCollapsed
                      ? "Bronnen tonen"
                      : "Bronnen inklappen"
                }
                aria-expanded={!sourcesCollapsed}
              >
                <FileCheck2 className="w-3.5 h-3.5" aria-hidden />
                Meenemen:
                {sourcesCollapsed && (
                  <span className="text-slate-400">
                    {selectedCount}/{sources.length}
                  </span>
                )}
                <ChevronDown
                  className={cn("w-3.5 h-3.5 transition-transform", sourcesCollapsed && "-rotate-90")}
                  aria-hidden
                />
              </button>
              {!sourcesCollapsed &&
                [...studentSources, ...referenceSources].map((source) => {
                  const checked = selectedSourceIds.includes(source.id);
                  const isRef = Boolean(source.isReference);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      title={`${source.name}${isRef ? " (referentie)" : ""} ${
                        checked ? "wordt meegenomen" : "staat uit (wordt niet meegenomen)"
                      }`}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border max-w-[14rem] transition-colors",
                        checked
                          ? isRef
                            ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                            : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                          : "border-slate-800 bg-slate-950/50 text-slate-500 line-through hover:text-slate-300",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          checked ? (isRef ? "bg-sky-400" : "bg-amber-400") : "bg-slate-600",
                        )}
                      />
                      <span className="truncate">{source.name}</span>
                    </button>
                  );
                })}
            </>
          )}
        </div>

        {/* Row 3: Optional focus + run */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 min-w-0 bg-slate-950 border border-slate-700/80 focus:border-amber-500/60 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none"
            placeholder="Optionele focus, bijv. 'jij-toon' of 'toets op HBO-i niveau 2'…"
            title="Optionele focus of instructie voor de AI, bijv. 'spreek student direct aan op jij-toon' of 'toets op HBO-i Architectuur niveau 2'"
            value={instructions}
            disabled={!sessionId || Boolean(busyAction)}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canRun) runAction(action);
            }}
          />
          <button
            type="button"
            disabled={!canRun}
            onClick={() => runAction(action)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-medium text-white transition-colors shrink-0"
            title={
              activeAction.needsDraft && !draft.trim()
                ? "Typ eerst steekwoorden of concepttekst in het tekstvak"
                : activeAction.description
            }
          >
            <ActionIcon className="w-3.5 h-3.5" aria-hidden />
            {busyLabel ?? activeAction.label}
          </button>
        </div>

        {contextLabel && <p className="text-[11px] text-slate-500">{contextLabel}</p>}
      </div>

      {/* Main editor + citations */}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-2.5 bg-slate-950/40">
        {!model && (
          <p className="text-sm text-amber-400 shrink-0">
            Kies een model in de balk bovenin om feedback te genereren.
          </p>
        )}
        {selection?.text && (
          <div className="text-xs bg-slate-800 p-2 rounded border border-amber-700 shrink-0">
            Selectie meenemen: {selection.text.slice(0, 120)}…
            <button type="button" className="ml-2 underline" onClick={onClearSelection}>
              wissen
            </button>
          </div>
        )}
        {error && <p className="text-red-400 text-xs whitespace-pre-wrap shrink-0">{error}</p>}
        {busyAction && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/70 border border-amber-500/40 text-xs text-slate-200 shrink-0">
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" aria-hidden />
            <span>
              {busyAction === "compose"
                ? "Bronnen lezen en conceptfeedback opstellen…"
                : busyAction === "expand"
                  ? "Steekwoorden uitwerken met voorbeelden uit de bronnen…"
                  : "Conceptfeedback herschrijven…"}
            </span>
          </div>
        )}

        {/* Editor toolbar */}
        {(draft.trim() || previousDraft !== null) && (
          <div className="flex items-center gap-1.5 shrink-0">
            {draft.trim() && (
              <div className="flex items-center bg-slate-950/80 p-0.5 rounded-md border border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  title="Bekijk de feedback opgemaakt (Markdown)"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors",
                    viewMode === "preview"
                      ? "bg-amber-600 text-white font-medium"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <Eye className="w-3 h-3" aria-hidden />
                  Weergave
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  title="Bewerk de ruwe tekst of steekwoorden"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors",
                    viewMode === "edit"
                      ? "bg-amber-600 text-white font-medium"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <Pencil className="w-3 h-3" aria-hidden />
                  Bewerken
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {previousDraft !== null && !busyAction && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
                  title="Herstel de tekst van vóór de laatste AI-actie"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden />
                  Vorige versie
                </button>
              )}
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-xs text-slate-200 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
                    Gekopieerd
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden />
                    Kopiëren
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {viewMode === "preview" && draft.trim() ? (
          <div
            onDoubleClick={() => {
              if (!busyAction) setViewMode("edit");
            }}
            title="Dubbelklik om de tekst te bewerken"
            className="flex-1 w-full overflow-y-auto bg-slate-900/90 border border-slate-700/80 rounded-lg p-3.5 text-sm text-slate-100 chat-md"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            className="flex-1 w-full bg-slate-900/90 border border-slate-700/80 focus:border-amber-500/60 rounded-lg p-3 text-sm text-slate-100 leading-relaxed outline-none resize-none font-sans"
            placeholder={
              "Schrijf hier je eigen steekwoorden of conceptfeedback, of klik op 'Opstellen'.\n\n" +
              "Voorbeeld steekwoorden voor 'Aanvullen':\n" +
              "- Probleemstelling is nog te breed geformuleerd\n" +
              "- Architectuurkeuze goed onderbouwd, maar security-aspecten ontbreken\n" +
              "- Vraag student hoe de testresultaten terugkoppelen naar de ontwerpkeuzes"
            }
            value={draft}
            disabled={!sessionId || Boolean(busyAction)}
            onChange={(e) => onDraftChange(e.target.value)}
            onBlur={() => onSaveDraft()}
          />
        )}

        {citations.length > 0 && (
          <div className="border-t border-slate-800/80 pt-2 shrink-0">
            <div className="text-[11px] text-slate-400 mb-1.5">
              Bronverwijzingen uit de laatste gegenereerde feedback (klik om te bekijken in het document):
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {sortCitations(citations).map((c, i) => (
                <button
                  key={`${c.chunkId}-${i}`}
                  type="button"
                  onClick={() => onCitationClick(c)}
                  title={citationTooltip(c)}
                  className="text-xs max-w-[min(100%,16rem)] truncate px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600 hover:border-amber-500 text-left"
                >
                  {formatCitationLabel(c)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
