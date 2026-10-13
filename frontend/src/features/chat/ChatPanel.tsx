import { useState } from "react";
import type { ChatMode, CitationDto, MessageDto } from "../../types/domain";
import { streamChat } from "../../services/api";
import { cn } from "../../lib/utils";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "explore", label: "Verkennen" },
  { id: "investigate", label: "Onderzoeken" },
  { id: "spar", label: "Sparren" },
];

interface Props {
  sessionId: string | null;
  model: string | null;
  sourceReady: boolean;
  messages: MessageDto[];
  onMessagesChange: (msgs: MessageDto[]) => void;
  onCitationClick: (c: CitationDto) => void;
  selection?: { text: string; chunkId?: string };
  onClearSelection: () => void;
}

export function ChatPanel({
  sessionId,
  model,
  sourceReady,
  messages,
  onMessagesChange,
  onCitationClick,
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

  const canType = Boolean(sessionId && model && sourceReady && !busy);
  const canSend = canType && input.trim().length > 0;

  async function send() {
    if (!sessionId || !model || !input.trim()) return;
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
    onMessagesChange([...messages, userMsg]);

    try {
      await streamChat(
        sessionId,
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
            if (strat === "full_document") setContextLabel("Gebaseerd op volledig document");
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
      if (sessionId) {
        const { getMessages } = await import("../../services/api");
        const serverMsgs = await getMessages(sessionId);
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
    <div className="flex flex-col h-full border-l border-slate-800">
      <div className="flex gap-1 p-2 border-b border-slate-800">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "px-2 py-1 text-xs rounded",
              mode === m.id ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!model && (
          <p className="text-sm text-amber-400">Kies een model in de balk bovenin om te chatten.</p>
        )}
        {model && !sourceReady && (
          <p className="text-sm text-slate-400">Wacht tot het document klaar is met verwerken.</p>
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
          <div key={m.id} className={cn("text-sm", m.role === "user" ? "text-slate-200" : "text-slate-100")}>
            <div className="text-xs text-slate-500 mb-1">{m.role === "user" ? "Jij" : "Assistent"}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.contextStrategy === "full_document" && (
              <div className="text-xs text-slate-500 mt-1">Gebaseerd op volledig document</div>
            )}
            {m.citations?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {m.citations.map((c, i) => (
                  <button
                    key={`${c.chunkId}-${i}`}
                    type="button"
                    onClick={() => onCitationClick(c)}
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600 hover:border-amber-500"
                  >
                    {c.pageNo ? `p. ${c.pageNo}` : c.sectionTitle || "Bron"}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {error && <p className="text-red-400 text-sm">{error}</p>}
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
