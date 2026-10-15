import { useEffect, useState } from "react";
import { Check, Copy, FileCheck2, RotateCcw, Sparkles, Wand2, FileEdit } from "lucide-react";
import type { CitationDto, FeedbackAction, SourceDto } from "../../types/domain";
import { streamFeedback } from "../../services/api";
import { citationTooltip, formatCitationLabel, sortCitations } from "../../lib/citations";
import { cn } from "../../lib/utils";

interface Props {
  sessionId: string | null;
  conversationId: string | null;
  model: string | null;
  sources: SourceDto[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveDraft: (value?: string) => void;
  onCitationClick: (citation: CitationDto) => void;
  selection?: { text: string; chunkId?: string };
  onClearSelection: () => void;
}

export function FeedbackPanel({
  sessionId,
  conversationId,
  model,
  sources,
  draft,
  onDraftChange,
  onSaveDraft,
  onCitationClick,
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
  }, [sessionId]);

  const studentSources = sources.filter((s) => !s.isReference);
  const referenceSources = sources.filter((s) => s.isReference);
  const activeReadyCount = sources.filter(
    (s) => selectedSourceIds.includes(s.id) && s.status === "ready",
  ).length;
  const canGenerate = Boolean(sessionId && model && activeReadyCount > 0 && !busyAction);

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
            const refCount = sources.filter(
              (s) => selectedSourceIds.includes(s.id) && s.isReference && s.status === "ready",
            ).length;
            setContextLabel(
              refCount > 0
                ? `Gebaseerd op ${count - refCount} studentbron(nen) + ${refCount} kader(s)`
                : `Gebaseerd op ${count} bron(nen) (puur LLM, zonder extra kaders)`,
            );
          }
          if (type === "citations" && data && typeof data === "object" && "items" in data) {
            setCitations((data as { items: CitationDto[] }).items);
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
    <div className="flex flex-col h-full border-l border-slate-800 bg-slate-950/20">
      {/* Context & controls header */}
      <div className="border-b border-slate-800 bg-slate-900/90 px-3 py-2.5 space-y-2.5 shrink-0">
        {/* Source and framework toggles */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium mr-0.5">
              <FileCheck2 className="w-3.5 h-3.5 text-amber-500/80" aria-hidden />
              Studentenwerk:
            </span>
            {studentSources.length === 0 ? (
              <span className="text-xs text-slate-500">Geen studentdocument gekoppeld</span>
            ) : (
              studentSources.map((source) => {
                const checked = selectedSourceIds.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => toggleSource(source.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border max-w-[14rem] transition-colors",
                      checked
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                        : "border-slate-800 bg-slate-950/50 text-slate-500 line-through hover:text-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        checked ? "bg-amber-400" : "bg-slate-600",
                      )}
                    />
                    <span className="truncate">{source.name}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium mr-0.5">
              Kaders & richtlijnen:
            </span>
            {referenceSources.length === 0 ? (
              <span className="text-[11px] text-slate-500">
                Geen (puur LLM) — klik op <strong className="text-slate-400 font-normal">Kader</strong> op een brontab om bijv. HBO-i of leerdoelen als richtlijn mee te nemen
              </span>
            ) : (
              referenceSources.map((source) => {
                const checked = selectedSourceIds.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => toggleSource(source.id)}
                    title={
                      checked
                        ? `${source.name} wordt meegenomen als referentiekader`
                        : `${source.name} staat uit (wordt niet meegenomen)`
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border max-w-[14rem] transition-colors",
                      checked
                        ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                        : "border-slate-800 bg-slate-950/50 text-slate-500 line-through hover:text-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        checked ? "bg-sky-400" : "bg-slate-600",
                      )}
                    />
                    <span className="truncate">{source.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Optional focus / instruction input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500/60 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none"
            placeholder="Optionele focus of instructie (bijv. 'spreek student direct aan op jij-toon' of 'toets op HBO-i Architectuur niveau 2')…"
            value={instructions}
            disabled={!sessionId || Boolean(busyAction)}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => runAction("compose")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-medium text-white transition-colors"
            title="Genereer nieuwe conceptfeedback op basis van de aangevinkte bronnen"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            {busyAction === "compose" ? "Opstellen…" : "Feedback opstellen"}
          </button>

          <button
            type="button"
            disabled={!canGenerate || !draft.trim()}
            onClick={() => runAction("expand")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 transition-colors"
            title="Werk je eigen steekwoorden of korte punten in het tekstvak uit met voorbeelden en bronverwijzingen"
          >
            <Wand2 className="w-3.5 h-3.5 text-amber-400" aria-hidden />
            {busyAction === "expand" ? "Aanvullen…" : "Steekwoorden aanvullen"}
          </button>

          <button
            type="button"
            disabled={!canGenerate || !draft.trim()}
            onClick={() => runAction("rewrite")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 transition-colors"
            title="Herschrijf je concepttekst scherper, constructiever en goed gestructureerd"
          >
            <FileEdit className="w-3.5 h-3.5 text-sky-400" aria-hidden />
            {busyAction === "rewrite" ? "Herschrijven…" : "Concept herschrijven"}
          </button>

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

        <textarea
          className="flex-1 w-full bg-slate-900/90 border border-slate-700/80 focus:border-amber-500/60 rounded-lg p-3 text-sm text-slate-100 leading-relaxed outline-none resize-none font-sans"
          placeholder={
            "Schrijf hier je eigen steekwoorden of conceptfeedback, of klik op 'Feedback opstellen'.\n\n" +
            "Voorbeeld steekwoorden voor 'Steekwoorden aanvullen':\n" +
            "- Probleemstelling is nog te breed geformuleerd\n" +
            "- Architectuurkeuze goed onderbouwd, maar security-aspecten ontbreken\n" +
            "- Vraag student hoe de testresultaten terugkoppelen naar de ontwerpkeuzes"
          }
          value={draft}
          disabled={!sessionId || Boolean(busyAction)}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={() => onSaveDraft()}
        />

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
