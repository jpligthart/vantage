import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight, FileCheck2, MessageSquare } from "lucide-react";
import type { ChatMode, CitationDto, MessageDto, SourceDto } from "../../types/domain";
import { streamChat } from "../../services/api";
import { cn } from "../../lib/utils";
import { ChatMessage } from "./ChatMessage";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "explore", label: "Verkennen" },
  { id: "investigate", label: "Onderzoeken" },
  { id: "spar", label: "Sparren" },
];

interface Props {
  sessionId: string | null;
  conversationId: string | null;
  conversationTitle: string;
  model: string | null;
  sourceReady: boolean;
  sources: SourceDto[];
  pinnedSourceIds: string[];
  memory: string;
  messages: MessageDto[];
  onMessagesChange: (msgs: MessageDto[]) => void;
  onCitationClick: (c: CitationDto) => void;
  onRenameConversation: (title: string) => void;
  onToggleSource: (sourceId: string) => void;
  onMemoryChange: (value: string) => void;
  onSaveMemory: () => void;
  onRemember: (content: string) => void;
  onAddToFeedback?: (content: string) => void;
  selection?: { text: string; chunkId?: string };
  onClearSelection: () => void;
}

export function ChatPanel({
  sessionId,
  conversationId,
  conversationTitle,
  model,
  sourceReady,
  sources,
  pinnedSourceIds,
  memory,
  messages,
  onMessagesChange,
  onCitationClick,
  onRenameConversation,
  onToggleSource,
  onMemoryChange,
  onSaveMemory,
  onRemember,
  onAddToFeedback,
  selection,
  onClearSelection,
}: Props) {
  const [mode, setMode] = useState<ChatMode>("spar");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [pendingCitations, setPendingCitations] = useState<CitationDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    setTitleDraft(conversationTitle);
  }, [conversationId, conversationTitle]);

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const canType = Boolean(sessionId && conversationId && model && sourceReady && !busy);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollChatToBottom(behavior: ScrollBehavior) {
    const run = () => bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  useLayoutEffect(() => {
    const userJustSent = messages.length > prevMessageCountRef.current;
    const hadStreaming = wasStreamingRef.current;
    const streamStarted = Boolean(streaming) && !hadStreaming;
    const streamEnded = !streaming && hadStreaming;
    const streamActive = Boolean(streaming);
    prevMessageCountRef.current = messages.length;
    wasStreamingRef.current = streamActive;

    if (userJustSent || streamStarted) {
      stickToBottomRef.current = true;
      scrollChatToBottom("smooth");
      return;
    }
    if (streamEnded && stickToBottomRef.current) {
      scrollChatToBottom("smooth");
      return;
    }
    if ((streamActive || pendingCitations.length > 0) && stickToBottomRef.current) {
      scrollChatToBottom("auto");
    }
  }, [messages, messages.length, streaming, pendingCitations.length]);

  useEffect(() => {
    if (!conversationId) return;
    setError(null);
    setStreaming("");
    stickToBottomRef.current = true;
    scrollChatToBottom("auto");
  }, [conversationId]);
  const canSend = canType && input.trim().length > 0;

  async function send() {
    if (!sessionId || !conversationId || !model || !input.trim()) return;
    const convAtSend = conversationId;
    setBusy(true);
    setError(null);
    setStreaming("");
    setPendingCitations([]);
    const userText = input.trim();
    setInput("");
    const userMsg: MessageDto = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userText,
      mode,
      createdAt: new Date().toISOString(),
      citations: [],
    };
    stickToBottomRef.current = true;
    onMessagesChange([...messages, userMsg]);

    try {
      await streamChat(
        sessionId,
        convAtSend,
        {
          message: userText,
          mode,
          model,
          selection: selection?.text,
          chunkId: selection?.chunkId,
        },
        (type, data) => {
          if (type === "token" && data && typeof data === "object" && "text" in data) {
            setStreaming((s) => s + String((data as { text: string }).text));
          }
          if (type === "context" && data && typeof data === "object" && "strategy" in data) {
            const strat = (data as { strategy: string }).strategy;
            const count = "sourceCount" in data ? Number((data as { sourceCount: number }).sourceCount) : 1;
            if (strat === "full_document") {
              const skipped = "skipped" in data && Array.isArray((data as { skipped: unknown }).skipped)
                ? (data as { skipped: string[] }).skipped
                : [];
              const base = count > 1 ? `Gebaseerd op ${count} documenten` : "Gebaseerd op volledig document";
              setContextLabel(
                skipped.length > 0 ? `${base}. Nog niet meegenomen: ${skipped.join(", ")}` : base,
              );
            }
          }
          if (type === "citations" && data && typeof data === "object" && "items" in data) {
            setPendingCitations((data as { items: CitationDto[] }).items);
          }
          if (type === "error" && data && typeof data === "object" && "message" in data) {
            setError(String((data as { message: string }).message));
          }
        },
      );
      onClearSelection();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat mislukt");
    } finally {
      setBusy(false);
      if (sessionId && conversationIdRef.current === convAtSend) {
        const { getMessages } = await import("../../services/api");
        const serverMsgs = await getMessages(sessionId, convAtSend);
        onMessagesChange(serverMsgs);
        setStreaming("");
        setPendingCitations([]);
      }
    }
  }

  const displayMessages = [...messages];
  if (streaming) {
    displayMessages.push({
      id: "streaming",
      role: "assistant",
      content: streaming,
      mode,
      createdAt: new Date().toISOString(),
      citations: pendingCitations,
    });
  }

  return (
    <div className="flex flex-col h-full border-l border-slate-800 bg-slate-950/20">
      <div className="border-b border-slate-800 bg-slate-900/90 px-3 py-2 space-y-2 shrink-0">
        {/* Row 1: Conversation Title + Mode Selector */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <MessageSquare className="w-4 h-4 text-amber-500/80 shrink-0" aria-hidden />
            <input
              className="w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-950 border border-transparent focus:border-slate-700 rounded px-1.5 py-0.5 text-sm font-semibold text-slate-100 outline-none transition-colors truncate"
              value={titleDraft}
              disabled={!conversationId}
              placeholder="Gesprekstitel…"
              aria-label="Gesprekstitel"
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
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  mode === m.id
                    ? "bg-amber-600 text-white font-medium shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Context Sources + Session Memory toggle */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
          {sources.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mr-0.5">
                <FileCheck2 className="w-3.5 h-3.5" aria-hidden />
                Meenemen:
              </span>
              {sources.map((source) => {
                const checked = pinnedSourceIds.length === 0 || pinnedSourceIds.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onToggleSource(source.id)}
                    title={checked ? `${source.name} wordt meegenomen in dit gesprek` : `${source.name} staat uit voor dit gesprek`}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border max-w-[13rem] transition-colors",
                      checked
                        ? source.isReference
                          ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                          : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                        : "border-slate-800 bg-slate-950/50 text-slate-500 line-through hover:text-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        checked ? (source.isReference ? "bg-sky-400" : "bg-amber-400") : "bg-slate-600",
                      )}
                    />
                    <span className="truncate">{source.name}</span>
                    {source.isReference && (
                      <span className="text-[10px] opacity-80 shrink-0">(Kader)</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Geen bronnen gekoppeld</span>
          )}

          <button
            type="button"
            disabled={!sessionId}
            onClick={() => setMemoryOpen((open) => !open)}
            className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors shrink-0 ml-auto",
              memoryOpen || memory.trim()
                ? "border-amber-600/50 bg-amber-500/10 text-amber-200"
                : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200",
            )}
            title="Sessiegeheugen bekijken of bewerken"
          >
            <Brain className="w-3.5 h-3.5" aria-hidden />
            <span>Sessiegeheugen</span>
            {memory.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="Gevuld" />
            )}
            {memoryOpen ? (
              <ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 opacity-70" aria-hidden />
            )}
          </button>
        </div>

        {/* Collapsible Session Memory Drawer */}
        {memoryOpen && (
          <div className="pt-1">
            <textarea
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500/60 rounded-md p-2 text-xs text-slate-200 min-h-[68px] outline-none"
              placeholder="Korte notities of afspraken die in elk gesprek van deze sessie meegaan…"
              value={memory}
              disabled={!sessionId}
              onChange={(e) => onMemoryChange(e.target.value)}
              onBlur={onSaveMemory}
            />
          </div>
        )}

        {contextLabel && <p className="text-[11px] text-slate-500">{contextLabel}</p>}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-5 bg-slate-950/40 scroll-smooth">
        {!model && (
          <p className="text-sm text-amber-400">Kies een model in de balk bovenin om te chatten.</p>
        )}
        {model && conversationId && !sourceReady && (
          <p className="text-sm text-slate-400">Wacht tot minstens één aangevinkte bron klaar is.</p>
        )}
        {sessionId && !conversationId && (
          <p className="text-sm text-slate-400">Deze sessie heeft nog geen gesprek.</p>
        )}
        {selection?.text && (
          <div className="text-xs bg-slate-800 p-2 rounded border border-amber-700">
            Selectie: {selection.text.slice(0, 120)}…
            <button type="button" className="ml-2 underline" onClick={onClearSelection}>
              wissen
            </button>
          </div>
        )}
        {displayMessages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            onCitationClick={onCitationClick}
            onRemember={m.role === "assistant" ? onRemember : undefined}
            onAddToFeedback={m.role === "assistant" ? onAddToFeedback : undefined}
          />
        ))}
        {error && <p className="text-red-400 text-sm whitespace-pre-wrap">{error}</p>}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
      <div className="p-3 border-t border-slate-800">
        <textarea
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm min-h-[72px]"
          placeholder="Stel een vraag..."
          value={input}
          disabled={!canType}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={send}
          className="mt-2 w-full py-2 rounded bg-amber-600 disabled:opacity-40 text-sm font-medium"
        >
          {busy ? "Bezig…" : "Versturen"}
        </button>
      </div>
    </div>
  );
}
