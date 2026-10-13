import { useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./features/chat/ChatPanel";
import { DocumentChrome } from "./features/documents/DocumentChrome";
import { DocxViewer } from "./features/documents/DocxViewer";
import { PdfViewer } from "./features/documents/PdfViewer";
import { ImportActions } from "./features/import/ImportActions";
import { SessionList } from "./features/sessions/SessionList";
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function confirmDeleteSession(id: string) {
    setDeletingId(id);
    setStatusText(null);
    try {
      await deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setSource(null);
        setMessages([]);
        setHighlight(null);
        setSelection(undefined);
      }
      setConfirmDeleteId(null);
      await refreshSessions();
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Sessie verwijderen mislukt");
    } finally {
      setDeletingId(null);
    }
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
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            confirmDeleteId={confirmDeleteId}
            deletingId={deletingId}
            onOpen={openSession}
            onRequestDelete={(id) => setConfirmDeleteId(id)}
            onCancelDelete={() => setConfirmDeleteId(null)}
            onConfirmDelete={confirmDeleteSession}
          />
          <ImportActions onFile={handleFile} onPasteText={handlePasteText} />
        </aside>
        <main className="flex-1 flex flex-col min-w-0">
          {statusText && <div className="px-4 py-2 text-sm bg-slate-800 text-amber-200">{statusText}</div>}
          {source?.status === "failed" && (
            <div className="px-4 py-2 text-sm text-red-400">{source.error}</div>
          )}
          <div className="flex-1 min-h-0 flex flex-col">
            {source && sourceReady ? (
              <>
                <DocumentChrome source={source} />
                {source.type === "pdf" ? (
                  <PdfViewer
                    sourceId={source.id}
                    highlight={highlight}
                    onTextSelect={(text) => setSelection({ text })}
                  />
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <DocxViewer sourceId={source.id} highlight={highlight} />
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                {activeSessionId ? "Wacht op document…" : "Open of importeer een document"}
              </div>
            )}
          </div>
          {sourceReady && selection?.text && (
            <div className="border-t border-slate-800 px-3 py-2 flex items-center gap-2 text-xs">
              <span className="text-slate-400 truncate flex-1">
                Selectie: {selection.text.slice(0, 80)}
                {selection.text.length > 80 ? "…" : ""}
              </span>
              <button
                type="button"
                className="text-amber-400 underline shrink-0"
                onClick={() => setSelection(undefined)}
              >
                wissen
              </button>
            </div>
          )}
        </main>
        <section className="w-[380px] min-w-[320px] min-h-0 flex flex-col">
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
