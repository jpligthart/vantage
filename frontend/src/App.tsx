import { useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./features/chat/ChatPanel";
import { DocxViewer } from "./features/documents/DocxViewer";
import { PdfViewer } from "./features/documents/PdfViewer";
import { ImportActions } from "./features/import/ImportActions";
import {
  attachSource,
  createSession,
  getMessages,
  getSession,
  getSource,
  getSourceStatus,
  listModels,
  deleteSession,
  listSessions,
  pasteSource,
  uploadSource,
} from "./services/api";
import type { CitationDto, MessageDto, SessionDto, SourceDto } from "./types/domain";

const MODEL_KEY = "review-assistant-model";

export default function App() {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [source, setSource] = useState<SourceDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(() => localStorage.getItem(MODEL_KEY));
  const [highlight, setHighlight] = useState<CitationDto | null>(null);
  const [selection, setSelection] = useState<{ text: string; chunkId?: string } | undefined>();
  const [statusText, setStatusText] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  useEffect(() => {
    refreshSessions();
    listModels().then(setModels).catch(() => setModels([]));
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    getMessages(activeSessionId).then(setMessages);
    getSession(activeSessionId).then(async (s) => {
      if (s.preferredModel && !model) {
        setModel(s.preferredModel);
        localStorage.setItem(MODEL_KEY, s.preferredModel);
      }
      const sid = s.sourceIds[0];
      if (sid) setSource(await getSource(sid));
    });
  }, [activeSessionId, model]);

  useEffect(() => {
    if (!source || source.status === "ready" || source.status === "failed") return;
    const id = source.id;
    const timer = setInterval(async () => {
      const st = await getSourceStatus(id);
      const updated = await getSource(id);
      setSource(updated);
      if (st.status === "ready") setStatusText(null);
      if (st.status === "failed") setStatusText(updated.error || "Verwerking mislukt");
    }, 2000);
    return () => clearInterval(timer);
  }, [source]);

  async function startWithSource(sourceId: string, sessionTitle: string) {
    const session = await createSession(sessionTitle, model || undefined);
    await attachSource(session.id, sourceId);
    const src = await getSource(sourceId);
    setSource(src);
    setActiveSessionId(session.id);
    setMessages([]);
    setStatusText("Document verwerken…");
    await refreshSessions();
  }

  async function handleFile(file: File) {
    setStatusText("Uploaden…");
    const { sourceId } = await uploadSource(file);
    await startWithSource(sourceId, file.name);
  }

  async function handlePasteText(text: string, title?: string) {
    setStatusText("Tekst importeren…");
    const { sourceId } = await pasteSource(text, title);
    const sessionTitle = title?.trim() || "Geplakte tekst";
    await startWithSource(sourceId, sessionTitle);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onModelChange(value: string) {
    setModel(value);
    localStorage.setItem(MODEL_KEY, value);
  }

  async function openSession(id: string) {
    setActiveSessionId(id);
    setHighlight(null);
  }

  async function handleDeleteSession(id: string, title: string) {
    if (!window.confirm(`Sessie "${title}" verwijderen? Het bronbestand blijft bewaard.`)) {
      return;
    }
    await deleteSession(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setSource(null);
      setMessages([]);
      setHighlight(null);
      setSelection(undefined);
    }
    await refreshSessions();
  }

  const sourceReady = source?.status === "ready";

  return (
    <div className="h-screen flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900">
        <h1 className="font-semibold">Review Assistant</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Model</label>
          <select
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
            value={model || ""}
            onChange={(e) => onModelChange(e.target.value)}
          >
            <option value="">— kies —</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-56 border-r border-slate-800 flex flex-col">
          <div className="p-2 text-xs text-slate-500 uppercase tracking-wide">Sessies</div>
          <ul className="flex-1 overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id} className="group flex items-stretch">
                <button
                  type="button"
                  onClick={() => openSession(s.id)}
                  className={`flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-slate-800 truncate ${
                    activeSessionId === s.id ? "bg-slate-800" : ""
                  }`}
                  title={s.title}
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(s.id, s.title)}
                  className="px-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                  title="Sessie verwijderen"
                  aria-label={`Sessie ${s.title} verwijderen`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <ImportActions onFile={handleFile} onPasteText={handlePasteText} />
        </aside>
        <main className="flex-1 flex flex-col min-w-0">
          {statusText && <div className="px-4 py-2 text-sm bg-slate-800 text-amber-200">{statusText}</div>}
          {source?.status === "failed" && (
            <div className="px-4 py-2 text-sm text-red-400">{source.error}</div>
          )}
          <div className="flex-1 min-h-0">
            {source && sourceReady ? (
              source.type === "pdf" ? (
                <PdfViewer sourceId={source.id} highlight={highlight} />
              ) : (
                <DocxViewer sourceId={source.id} highlight={highlight} />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                {activeSessionId ? "Wacht op document…" : "Open of importeer een document"}
              </div>
            )}
          </div>
          {sourceReady && (
            <div className="border-t border-slate-800 p-2">
              <button
                type="button"
                className="text-xs text-amber-400 underline"
                onClick={() => {
                  const text = window.prompt("Plak of typ een passage om te bespreken:");
                  if (text) setSelection({ text });
                }}
              >
                Bespreek selectie (tekst plakken)
              </button>
            </div>
          )}
        </main>
        <section className="w-[380px] min-w-[320px]">
          <ChatPanel
            sessionId={activeSessionId}
            model={model}
            sourceReady={Boolean(sourceReady)}
            messages={messages}
            onMessagesChange={setMessages}
            onCitationClick={setHighlight}
            selection={selection}
            onClearSelection={() => setSelection(undefined)}
          />
        </section>
      </div>
    </div>
  );
}
