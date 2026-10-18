import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight, FileCheck2, MessageSquare, Square } from "lucide-react";
import type { ChatMode, CitationDto, MessageDto, SourceDto } from "../../types/domain";
import { getMessages, streamChat, truncateMessagesFrom } from "../../services/api";
import { cn } from "../../lib/utils";
import { ChatMessage } from "./ChatMessage";

const MODES: { id: ChatMode; label: string; summary: string; description: string }[] = [
  {
    id: "explore",
    label: "Verkennen",
    summary: "Overzicht & structuur in kaart brengen zonder direct oordeel.",
    description:
      "Verkennen: brengt structuur en hoofdthema's in kaart en legt verbanden zonder observaties als harde feiten te presenteren.",
  },
  {
    id: "investigate",
    label: "Onderzoeken",
    summary: "Gericht bewijs en citaten zoeken in de bronnen.",
    description:
      "Onderzoeken: zoekt gericht naar bewijs in de tekst en maakt scherp onderscheid tussen wat er letterlijk staat en wat je afleidt.",
  },
  {
    id: "spar",
    label: "Sparren",
    summary: "Kritisch klankbord: toetst aannames en zoekt tegenbewijs.",
    description:
      "Sparren: denkt kritisch tegen, zoekt tegenbewijs bij je aannames en ordent naar observaties, interpretaties en onzekerheden.",
  },
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

interface StreamState {
  streaming: string;
  pendingCitations: CitationDto[];
  contextLabel: string | null;
  busy: boolean;
  error: string | null;
  mode: ChatMode;
}

const EMPTY_STREAM: StreamState = {
  streaming: "",
  pendingCitations: [],
  contextLabel: null,
  busy: false,
  error: null,
  mode: "spar",
};

const SOURCES_COLLAPSED_KEY = "review-assistant-chat-sources-collapsed";

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
  const [streams, setStreams] = useState<Record<string, StreamState>>({});
  const [titleDraft, setTitleDraft] = useState(conversationTitle);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(
    () => localStorage.getItem(SOURCES_COLLAPSED_KEY) !== "0",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const wasStreamingRef = useRef(false);
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const currentStream = conversationId ? (streams[conversationId] ?? EMPTY_STREAM) : EMPTY_STREAM;
  const { streaming, pendingCitations, contextLabel, busy, error } = currentStream;

  function patchStream(
    targetConversationId: string,
    updater: (prev: StreamState) => Partial<StreamState>,
  ) {
    setStreams((prev) => {
      const current = prev[targetConversationId] ?? EMPTY_STREAM;
      return {
        ...prev,
        [targetConversationId]: { ...current, ...updater(current) },
      };
    });
  }

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
    const streamActive = busy || Boolean(streaming);
    const streamStarted = streamActive && !hadStreaming;
    const streamEnded = !streamActive && hadStreaming;
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
  }, [messages, messages.length, busy, streaming, pendingCitations.length]);

  useEffect(() => {
    if (!conversationId) return;
    stickToBottomRef.current = true;
    scrollChatToBottom("auto");
  }, [conversationId]);
  const canSend = canType && input.trim().length > 0;

  function stopStream() {
    if (!conversationId) return;
    const ctrl = abortControllersRef.current[conversationId];
    if (ctrl) {
      ctrl.abort();
      delete abortControllersRef.current[conversationId];
    }
  }

  async function runStream(userText: string, baseMessages: MessageDto[]) {
    if (!sessionId || !conversationId || !model || !userText.trim()) return;
    const sessionAtSend = sessionId;
    const convAtSend = conversationId;
    const modeAtSend = mode;
    abortControllersRef.current[convAtSend]?.abort();
    const controller = new AbortController();
    abortControllersRef.current[convAtSend] = controller;
    patchStream(convAtSend, () => ({
      busy: true,
      error: null,
      streaming: "",
      pendingCitations: [],
      mode: modeAtSend,
    }));
    const userMsg: MessageDto = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userText,
      mode: modeAtSend,
      createdAt: new Date().toISOString(),
      citations: [],
    };
    stickToBottomRef.current = true;
    onMessagesChange([...baseMessages, userMsg]);

    try {
      await streamChat(
        sessionAtSend,
        convAtSend,
        {
          message: userText,
          mode: modeAtSend,
          model,
          selection: selection?.text,
          chunkId: selection?.chunkId,
        },
        (type, data) => {
          if (type === "token" && data && typeof data === "object" && "text" in data) {
            const chunk = String((data as { text: string }).text);
            patchStream(convAtSend, (prev) => ({
              streaming: prev.streaming + chunk,
            }));
          }
          if (type === "context" && data && typeof data === "object" && "strategy" in data) {
            const strat = (data as { strategy: string }).strategy;
            const count = "sourceCount" in data ? Number((data as { sourceCount: number }).sourceCount) : 1;
            const skipped = "skipped" in data && Array.isArray((data as { skipped: unknown }).skipped)
              ? (data as { skipped: string[] }).skipped
              : [];
            let base: string;
            if (strat === "retrieved_references") {
              base = "Studentenwerk volledig + relevante kaderpassages";
            } else if (strat === "full_document") {
              base = count > 1 ? `Gebaseerd op ${count} documenten` : "Gebaseerd op volledig document";
            } else {
              base = `Contextstrategie: ${strat}`;
            }
            patchStream(convAtSend, () => ({
              contextLabel: skipped.length > 0 ? `${base}. Nog niet meegenomen: ${skipped.join(", ")}` : base,
            }));
          }
          if (type === "citations" && data && typeof data === "object" && "items" in data) {
            patchStream(convAtSend, () => ({
              pendingCitations: (data as { items: CitationDto[] }).items,
            }));
          }
          if (type === "error" && data && typeof data === "object" && "message" in data) {
            patchStream(convAtSend, () => ({
              error: String((data as { message: string }).message),
            }));
          }
        },
        controller.signal,
      );
      if (conversationIdRef.current === convAtSend) {
        onClearSelection();
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (!aborted) {
        patchStream(convAtSend, () => ({
          error: e instanceof Error ? e.message : "Chat mislukt",
        }));
      }
    } finally {
      if (abortControllersRef.current[convAtSend] === controller) {
        delete abortControllersRef.current[convAtSend];
      }
      patchStream(convAtSend, () => ({
        busy: false,
      }));
      try {
        const serverMsgs = await getMessages(sessionAtSend, convAtSend);
        if (conversationIdRef.current === convAtSend) {
          onMessagesChange(serverMsgs);
        }
      } catch {
        // Keep existing messages visible if refresh fails
      } finally {
        patchStream(convAtSend, () => ({
          streaming: "",
          pendingCitations: [],
        }));
      }
    }
  }

  async function send() {
    if (!canType || !input.trim()) return;
    const userText = input.trim();
    setInput("");
    await runStream(userText, messages);
  }

  async function replayFromUserMessage(targetUserMsg: MessageDto, newContent?: string) {
    if (!sessionId || !conversationId || !model || !sourceReady || busy) return;
    const textToSend = (newContent ?? targetUserMsg.content).trim();
    if (!textToSend) return;
    try {
      const remaining = await truncateMessagesFrom(sessionId, conversationId, targetUserMsg.id);
      await runStream(textToSend, remaining);
    } catch (e) {
      patchStream(conversationId, () => ({
        error: e instanceof Error ? e.message : "Bericht opnieuw versturen mislukt",
      }));
    }
  }

  async function retryAssistantMessage(assistantMsg: MessageDto) {
    const idx = messages.findIndex((m) => m.id === assistantMsg.id);
    if (idx <= 0) return;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        await replayFromUserMessage(messages[i]);
        return;
      }
    }
  }

  const displayMessages = [...messages];
  if (busy || streaming) {
    const last = displayMessages[displayMessages.length - 1];
    if (busy && last?.role === "assistant") {
      displayMessages[displayMessages.length - 1] = {
        ...last,
        id: "streaming",
        content: streaming || last.content,
        citations: pendingCitations.length > 0 ? pendingCitations : last.citations,
      };
    } else {
      displayMessages.push({
        id: "streaming",
        role: "assistant",
        content: streaming,
        mode: currentStream.mode,
        createdAt: new Date().toISOString(),
        citations: pendingCitations,
      });
    }
  }

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[2];

  return (
    <div className="flex flex-col h-full bg-slate-950/20">
      <div className="border-b border-slate-800 bg-slate-900/90 px-3 py-2 space-y-1.5 shrink-0">
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
              title="Klik om de titel van dit gesprek aan te passen"
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
                title={m.description}
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

        {/* Mode explanation line */}
        <p className="text-[11px] text-slate-400 text-right leading-tight">
          <span className="text-amber-400/90 font-medium">{activeMode.label}:</span> {activeMode.summary}
        </p>

        {/* Row 2: Context Sources + Session Memory */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 pt-0.5">
          {sources.length > 0 ? (
            <div className="contents">
              <button
                type="button"
                onClick={() =>
                  setSourcesCollapsed((value) => {
                    localStorage.setItem(SOURCES_COLLAPSED_KEY, value ? "0" : "1");
                    return !value;
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 mr-0.5 transition-colors"
                title={sourcesCollapsed ? "Bronnen tonen" : "Bronnen inklappen"}
                aria-expanded={!sourcesCollapsed}
              >
                <FileCheck2 className="w-3.5 h-3.5" aria-hidden />
                Meenemen:
                {sourcesCollapsed && (
                  <span className="text-slate-400">
                    {pinnedSourceIds.length === 0 ? sources.length : pinnedSourceIds.length}/{sources.length}
                  </span>
                )}
                <ChevronDown
                  className={cn("w-3.5 h-3.5 transition-transform", sourcesCollapsed && "-rotate-90")}
                  aria-hidden
                />
              </button>
              {!sourcesCollapsed && sources.map((source) => {
                const checked = pinnedSourceIds.length === 0 || pinnedSourceIds.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => onToggleSource(source.id)}
                    title={`${source.name}${source.isReference ? " (referentie)" : ""} ${
                      checked ? "wordt meegenomen in dit gesprek" : "staat uit voor dit gesprek"
                    }`}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border max-w-[14rem] transition-colors",
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
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-slate-500">Geen bronnen gekoppeld</span>
          )}

          <span className="text-slate-700 text-xs" aria-hidden>
            ·
          </span>
          <button
            type="button"
            disabled={!sessionId}
            onClick={() => setMemoryOpen((open) => !open)}
            className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors shrink-0",
              memoryOpen || memory.trim()
                ? "border-amber-600/50 bg-amber-500/10 text-amber-200"
                : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200",
            )}
            title="Sessiegeheugen: vaste afspraken die in elk gesprek én bij feedback meegaan. Wordt bewaard. (Anders dan de extra instructie bij Feedback, die alleen bij één knopklik meegaat.)"
          >
            <Brain className="w-3.5 h-3.5" aria-hidden />
            <span>Geheugen</span>
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
              placeholder="Vaste afspraken voor deze sessie (chat én feedback), bijv. 'jij-vorm, 2ejaars AD'…"
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
            disabled={!canType}
            onCitationClick={onCitationClick}
            onRemember={m.role === "assistant" ? onRemember : undefined}
            onAddToFeedback={m.role === "assistant" ? onAddToFeedback : undefined}
            onRetry={
              m.role === "user"
                ? () => replayFromUserMessage(m)
                : () => retryAssistantMessage(m)
            }
            onEdit={m.role === "user" ? (next) => replayFromUserMessage(m, next) : undefined}
          />
        ))}
        {error && <p className="text-red-400 text-sm whitespace-pre-wrap">{error}</p>}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
      <div className="p-3 border-t border-slate-800">
        <textarea
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm min-h-[72px] disabled:opacity-60"
          placeholder={busy ? "Antwoord wordt gegenereerd…" : "Stel een vraag..."}
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
        {busy ? (
          <button
            type="button"
            onClick={stopStream}
            title="Stop het genereren en behoud het antwoord dat er al staat"
            className="mt-2 w-full py-2 rounded bg-slate-800 hover:bg-slate-700 border border-amber-500/50 text-amber-200 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" aria-hidden />
            Stoppen
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            className="mt-2 w-full py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm font-medium transition-colors"
          >
            Versturen
          </button>
        )}
      </div>
    </div>
  );
}
