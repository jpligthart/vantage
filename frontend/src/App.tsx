import { useCallback, useEffect, useRef, useState } from "react";
import { FileEdit, MessageSquare } from "lucide-react";
import { ResizableColumns } from "./components/ResizableColumns";
import { ChatPanel } from "./features/chat/ChatPanel";
import { DocumentChrome } from "./features/documents/DocumentChrome";
import { DocxViewer } from "./features/documents/DocxViewer";
import { PdfViewer } from "./features/documents/PdfViewer";
import { SourceBar } from "./features/documents/SourceBar";
import { FeedbackPanel } from "./features/feedback/FeedbackPanel";
import { NewSessionDialog } from "./features/sessions/NewSessionDialog";
import { SessionList } from "./features/sessions/SessionList";
import {
  appendMemory,
  attachSource,
  createConversation,
  createSession,
  deleteConversation,
  deleteSession,
  detachSource,
  getMessages,
  getSession,
  getSource,
  listModels,
  listSessions,
  listSources,
  pasteSource,
  renameConversation,
  saveFeedbackDraft,
  saveMemory,
  setConversationSources,
  updateSession,
  updateSource,
  uploadSource,
} from "./services/api";
import type { CitationDto, MessageDto, SessionDetail, SessionDto, SourceDto } from "./types/domain";

const MODEL_KEY = "review-assistant-model";

export default function App() {
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(() => localStorage.getItem(MODEL_KEY));
  const [highlight, setHighlight] = useState<CitationDto | null>(null);
  const [selection, setSelection] = useState<{ text: string; chunkId?: string } | undefined>();
  const [statusText, setStatusText] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteConversationId, setConfirmDeleteConversationId] = useState<string | null>(null);
  const [library, setLibrary] = useState<SourceDto[]>([]);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"chat" | "feedback">("chat");
  const [memory, setMemory] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const memoryDirty = useRef(false);
  const feedbackDirty = useRef(false);
  const labelsSessionId = useRef<string | null>(null);
  const loadSeq = useRef(0);
  const preferredConversationId = useRef<string | null>(null);
  const memoryQueue = useRef(Promise.resolve());

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  const loadDetail = useCallback(
    async (
      sessionId: string,
      prefer?: { conversationId?: string | null; sourceId?: string | null },
    ) => {
      const seq = ++loadSeq.current;
      const next = await getSession(sessionId);
      if (seq !== loadSeq.current) return next;
      setDetail(next);
      const wanted = prefer?.conversationId ?? preferredConversationId.current;
      const conversationId =
        wanted && next.conversations.some((c) => c.id === wanted)
          ? wanted
          : next.conversations[0]?.id ?? null;
      preferredConversationId.current = null;
      setActiveConversationId(conversationId);
      setActiveSourceId((current) => {
        if (prefer?.sourceId && next.sources.some((source) => source.id === prefer.sourceId)) {
          return prefer.sourceId;
        }
        if (current && next.sources.some((source) => source.id === current)) return current;
        return next.sources[0]?.id ?? null;
      });
      if (!memoryDirty.current) setMemory(next.memory ?? "");
      if (!feedbackDirty.current) setFeedbackDraft(next.feedbackDraft ?? "");
      if (conversationId) {
        const loaded = await getMessages(sessionId, conversationId);
        if (seq !== loadSeq.current) return next;
        setMessages(loaded);
      } else setMessages([]);
      const pending = next.sources.some(
        (source) => source.status === "queued" || source.status === "processing",
      );
      if (!pending) setStatusText((current) => (current === "Document verwerken…" ? null : current));
      return next;
    },
    [],
  );

  useEffect(() => {
    refreshSessions();
    listModels().then(setModels).catch(() => setModels([]));
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    loadDetail(activeSessionId).catch((e) => {
      if (!cancelled) setStatusText(e instanceof Error ? e.message : "Sessie laden mislukt");
    });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, loadDetail]);

  useEffect(() => {
    if (!detail || labelsSessionId.current === detail.id) return;
    labelsSessionId.current = detail.id;
    memoryDirty.current = false;
    feedbackDirty.current = false;
    setMemory(detail.memory ?? "");
    setFeedbackDraft(detail.feedbackDraft ?? "");
  }, [detail]);

  useEffect(() => {
    if (detail?.preferredModel && !model) {
      setModel(detail.preferredModel);
      localStorage.setItem(MODEL_KEY, detail.preferredModel);
    }
  }, [detail, model]);

  const sources = detail?.sources ?? [];
  const pendingKey = sources
    .filter((source) => source.status === "queued" || source.status === "processing")
    .map((source) => source.id)
    .join(",");

  useEffect(() => {
    if (!pendingKey || !activeSessionId) return;
    const ids = pendingKey.split(",");
    const timer = setInterval(async () => {
      const updated = await Promise.all(ids.map((id) => getSource(id)));
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          sources: current.sources.map(
            (source) => updated.find((item) => item.id === source.id) ?? source,
          ),
        };
      });
      if (updated.every((source) => source.status === "ready" || source.status === "failed")) {
        setStatusText((current) => (current === "Document verwerken…" ? null : current));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [pendingKey, activeSessionId]);

  function fail(error: unknown, fallback: string) {
    setStatusText(error instanceof Error ? error.message : fallback);
  }

  async function startWithSource(sourceId: string, sessionTitle: string) {
    const session = await createSession(sessionTitle, model || undefined);
    await attachSource(session.id, sourceId);
    const src = await getSource(sourceId);
    labelsSessionId.current = null;
    setActiveSessionId(session.id);
    setMessages([]);
    setHighlight(null);
    setSelection(undefined);
    setStatusText(src.status === "ready" || src.status === "failed" ? null : "Document verwerken…");
    await refreshSessions();
  }

  async function addSourceToSession(sourceId: string) {
    if (!activeSessionId) {
      const src = await getSource(sourceId);
      await startWithSource(sourceId, src.name);
      return;
    }
    await attachSource(activeSessionId, sourceId);
    setStatusText("Document verwerken…");
    await loadDetail(activeSessionId, {
      conversationId: activeConversationId,
      sourceId,
    });
    await refreshSessions();
  }

  async function handleNewFile(file: File, sessionName = "") {
    try {
      setNewSessionOpen(false);
      setStatusText("Uploaden…");
      const { sourceId } = await uploadSource(file);
      await startWithSource(sourceId, sessionName.trim() || file.name);
    } catch (error) {
      fail(error, "Uploaden mislukt");
    }
  }

  async function handleNewPaste(text: string, title: string | undefined, sessionName = "") {
    try {
      setNewSessionOpen(false);
      setStatusText("Tekst importeren…");
      const { sourceId } = await pasteSource(text, title);
      await startWithSource(sourceId, sessionName.trim() || title?.trim() || "Geplakte tekst");
    } catch (error) {
      fail(error, "Tekst importeren mislukt");
    }
  }

  async function handleNewExisting(source: SourceDto, sessionName: string) {
    try {
      setNewSessionOpen(false);
      await startWithSource(source.id, sessionName.trim() || source.name);
    } catch (error) {
      fail(error, "Sessie starten mislukt");
    }
  }

  async function handleAddFile(file: File) {
    try {
      setStatusText("Uploaden…");
      const { sourceId } = await uploadSource(file);
      await addSourceToSession(sourceId);
    } catch (error) {
      fail(error, "Uploaden mislukt");
    }
  }

  async function handleAddPaste(text: string, title?: string) {
    try {
      setStatusText("Tekst importeren…");
      const { sourceId } = await pasteSource(text, title);
      await addSourceToSession(sourceId);
    } catch (error) {
      fail(error, "Tekst importeren mislukt");
    }
  }

  function onDocumentDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (activeSessionId) handleAddFile(file);
    else handleNewFile(file);
  }

  function onModelChange(value: string) {
    setModel(value);
    localStorage.setItem(MODEL_KEY, value);
  }

  function openSession(id: string) {
    if (id === activeSessionId) return;
    labelsSessionId.current = null;
    memoryDirty.current = false;
    feedbackDirty.current = false;
    setHighlight(null);
    setSelection(undefined);
    setMessages([]);
    setActiveSessionId(id);
  }

  async function openConversation(sessionId: string, conversationId: string) {
    setHighlight(null);
    setRightTab("chat");
    if (sessionId !== activeSessionId) {
      labelsSessionId.current = null;
      memoryDirty.current = false;
      feedbackDirty.current = false;
      preferredConversationId.current = conversationId;
      setMessages([]);
      setActiveSessionId(sessionId);
      return;
    }
    setActiveConversationId(conversationId);
    setMessages(await getMessages(sessionId, conversationId));
  }

  async function handleCreateConversation(sessionId: string) {
    const created = await createConversation(sessionId);
    await refreshSessions();
    if (sessionId !== activeSessionId) {
      labelsSessionId.current = null;
      memoryDirty.current = false;
      preferredConversationId.current = created.id;
      setMessages([]);
      setActiveSessionId(sessionId);
      return;
    }
    await loadDetail(sessionId, { conversationId: created.id, sourceId: activeSourceId });
  }

  async function handleRenameConversation(title: string) {
    if (!activeSessionId || !activeConversationId) return;
    await renameConversation(activeSessionId, activeConversationId, title);
    setDetail((current) =>
      current
        ? {
            ...current,
            conversations: current.conversations.map((conversation) =>
              conversation.id === activeConversationId ? { ...conversation, title } : conversation,
            ),
          }
        : current,
    );
    await refreshSessions();
  }

  async function confirmDeleteSession(id: string) {
    setDeletingId(id);
    setStatusText(null);
    try {
      await deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setActiveConversationId(null);
        setActiveSourceId(null);
        setDetail(null);
        setMessages([]);
        setHighlight(null);
        setSelection(undefined);
        setMemory("");
        setFeedbackDraft("");
        labelsSessionId.current = null;
      }
      setConfirmDeleteId(null);
      await refreshSessions();
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Sessie verwijderen mislukt");
    } finally {
      setDeletingId(null);
    }
  }

  async function confirmDeleteConversation(sessionId: string, conversationId: string) {
    await deleteConversation(sessionId, conversationId);
    setConfirmDeleteConversationId(null);
    await refreshSessions();
    if (sessionId === activeSessionId) {
      await loadDetail(sessionId, {
        conversationId: activeConversationId,
        sourceId: activeSourceId,
      });
    }
  }

  async function saveSessionTitle(title: string) {
    if (!activeSessionId || title === detail?.title) return;
    try {
      const updated = await updateSession(activeSessionId, { title });
      setDetail(updated);
      await refreshSessions();
    } catch (error) {
      fail(error, "Sessienaam opslaan mislukt");
    }
  }

  async function handleDetach(sourceId: string) {
    if (!activeSessionId) return;
    await detachSource(activeSessionId, sourceId);
    if (activeSourceId === sourceId) setActiveSourceId(null);
    await loadDetail(activeSessionId, { conversationId: activeConversationId });
  }

  async function handleToggleReference(sourceId: string, isReference: boolean) {
    try {
      const updated = await updateSource(sourceId, { isReference });
      setDetail((current) =>
        current
          ? {
              ...current,
              sources: current.sources.map((s) => (s.id === sourceId ? { ...s, isReference: updated.isReference } : s)),
            }
          : current,
      );
      setLibrary((current) =>
        current.map((s) => (s.id === sourceId ? { ...s, isReference: updated.isReference } : s)),
      );
    } catch (error) {
      fail(error, "Bron bijwerken mislukt");
    }
  }

  async function toggleContextSource(sourceId: string) {
    if (!activeSessionId || !activeConversationId || !detail) return;
    const conversation = detail.conversations.find((item) => item.id === activeConversationId);
    const allIds = detail.sources.map((source) => source.id);
    const pins = conversation?.sourceIds ?? [];
    const current = pins.length === 0 ? allIds : pins.filter((id) => allIds.includes(id));
    const next = current.includes(sourceId)
      ? current.filter((id) => id !== sourceId)
      : [...current, sourceId];
    if (next.length === 0) {
      setStatusText("Een gesprek houdt minstens één bron aan.");
      return;
    }
    const result = await setConversationSources(activeSessionId, activeConversationId, next);
    setDetail((currentDetail) =>
      currentDetail
        ? {
            ...currentDetail,
            conversations: currentDetail.conversations.map((item) =>
              item.id === activeConversationId ? { ...item, sourceIds: result.sourceIds } : item,
            ),
          }
        : currentDetail,
    );
    await refreshSessions();
  }

  function enqueueMemory(task: () => Promise<void>) {
    const run = memoryQueue.current.then(task, task);
    memoryQueue.current = run;
    return run;
  }

  async function persistMemory() {
    if (!activeSessionId || !memoryDirty.current) return;
    const snapshot = memory;
    const sessionId = activeSessionId;
    memoryDirty.current = false;
    try {
      await enqueueMemory(async () => {
        const saved = await saveMemory(sessionId, snapshot);
        setMemory(saved.content);
        setDetail((current) =>
          current && current.id === sessionId ? { ...current, memory: saved.content } : current,
        );
      });
    } catch (error) {
      fail(error, "Sessiegeheugen opslaan mislukt");
    }
  }

  async function remember(content: string) {
    if (!activeSessionId) return;
    const sessionId = activeSessionId;
    memoryDirty.current = false;
    try {
      await enqueueMemory(async () => {
        const saved = await appendMemory(sessionId, content);
        setMemory(saved.content);
        setDetail((current) =>
          current && current.id === sessionId ? { ...current, memory: saved.content } : current,
        );
        setStatusText("In het sessiegeheugen gezet.");
      });
    } catch (error) {
      fail(error, "Sessiegeheugen bijwerken mislukt");
    }
  }

  async function persistFeedback(overrideValue?: string) {
    if (!activeSessionId) return;
    if (overrideValue === undefined && !feedbackDirty.current) return;
    const snapshot = overrideValue !== undefined ? overrideValue : feedbackDraft;
    const sessionId = activeSessionId;
    feedbackDirty.current = false;
    try {
      const saved = await saveFeedbackDraft(sessionId, snapshot);
      setFeedbackDraft(saved.content);
      setDetail((current) =>
        current && current.id === sessionId ? { ...current, feedbackDraft: saved.content } : current,
      );
    } catch (error) {
      fail(error, "Feedback opslaan mislukt");
    }
  }

  async function addToFeedback(content: string) {
    if (!activeSessionId) return;
    const next = feedbackDraft.trim() ? `${feedbackDraft.trim()}\n\n${content.trim()}` : content.trim();
    setFeedbackDraft(next);
    feedbackDirty.current = false;
    await persistFeedback(next);
    setRightTab("feedback");
    setStatusText("Toegevoegd aan feedbackconcept.");
  }

  function onCitationClick(citation: CitationDto) {
    setHighlight(citation);
    if (citation.sourceId && sources.some((source) => source.id === citation.sourceId)) {
      setActiveSourceId(citation.sourceId);
    }
  }

  const activeSource = sources.find((source) => source.id === activeSourceId) ?? null;
  const conversation = detail?.conversations.find((item) => item.id === activeConversationId) ?? null;
  const pinnedSourceIds = conversation?.sourceIds ?? [];
  const contextSources =
    pinnedSourceIds.length === 0
      ? sources
      : sources.filter((source) => pinnedSourceIds.includes(source.id));
  const contextReady = contextSources.some((source) => source.status === "ready");
  const sourceReady = activeSource?.status === "ready";

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        <h1 className="font-semibold text-sm tracking-tight text-slate-100">Review Assistant</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Model</label>
          <select
            className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-amber-500/60"
            value={model || ""}
            onChange={(e) => onModelChange(e.target.value)}
          >
            <option value="">— kies model —</option>
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800/70">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sessies</span>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
              onClick={() => {
                setNewSessionOpen(true);
                listSources().then(setLibrary).catch(() => setLibrary([]));
              }}
            >
              + Nieuw
            </button>
          </div>
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            activeConversationId={activeConversationId}
            confirmDeleteId={confirmDeleteId}
            deletingId={deletingId}
            confirmDeleteConversationId={confirmDeleteConversationId}
            onOpen={openSession}
            onOpenConversation={openConversation}
            onCreateConversation={handleCreateConversation}
            onRequestDelete={(id) => setConfirmDeleteId(id)}
            onCancelDelete={() => setConfirmDeleteId(null)}
            onConfirmDelete={confirmDeleteSession}
            onRequestDeleteConversation={(id) => setConfirmDeleteConversationId(id)}
            onCancelDeleteConversation={() => setConfirmDeleteConversationId(null)}
            onConfirmDeleteConversation={confirmDeleteConversation}
          />
        </aside>
        <ResizableColumns
          storageKey="review-assistant-doc-chat-ratio"
          defaultTrailingRatio={0.58}
          leadingMinPx={240}
          trailingMinPx={300}
          leading={
            <main
              className="flex flex-1 flex-col min-h-0 min-w-0 h-full"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDocumentDrop}
            >
              {statusText && (
                <div className="px-4 py-2 text-sm bg-slate-800 text-amber-200 shrink-0 whitespace-pre-wrap">{statusText}</div>
              )}
              {activeSessionId && (
                <SourceBar
                  sources={sources}
                  activeSourceId={activeSourceId}
                  sessionTitle={detail?.title ?? ""}
                  library={library}
                  onRenameSession={saveSessionTitle}
                  onSelect={setActiveSourceId}
                  onDetach={handleDetach}
                  onFile={handleAddFile}
                  onPasteText={handleAddPaste}
                  onAttachExisting={addSourceToSession}
                  onToggleReference={handleToggleReference}
                  onOpenLibrary={() => {
                    listSources().then(setLibrary).catch(() => setLibrary([]));
                  }}
                />
              )}
              {activeSource?.status === "failed" && (
                <div className="px-4 py-2 text-sm text-red-400 shrink-0">{activeSource.error}</div>
              )}
              <div className="flex-1 min-h-0 flex flex-col">
                {activeSource && sourceReady ? (
                  <>
                    <DocumentChrome source={activeSource} />
                    {activeSource.type === "pdf" ? (
                      <PdfViewer
                        sourceId={activeSource.id}
                        highlight={highlight?.sourceId === activeSource.id ? highlight : null}
                        onTextSelect={(text) => setSelection({ text })}
                      />
                    ) : (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <DocxViewer
                          sourceId={activeSource.id}
                          highlight={highlight?.sourceId === activeSource.id ? highlight : null}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-sm px-6 text-center">
                    {activeSessionId
                      ? activeSource
                        ? "Wacht op document…"
                        : "Voeg een document toe aan deze sessie"
                      : "Start een nieuwe sessie links, of sleep een bestand hierheen"}
                  </div>
                )}
              </div>
              {sourceReady && selection?.text && (
                <div className="border-t border-slate-800 px-3 py-2 flex items-center gap-2 text-xs shrink-0">
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
          }
          trailing={
            <section className="min-h-0 flex flex-col h-full">
              <div className="flex items-center gap-1 px-3 pt-2 border-b border-slate-800 border-l bg-slate-900 shrink-0">
                <button
                  type="button"
                  onClick={() => setRightTab("chat")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${
                    rightTab === "chat"
                      ? "border-amber-500 text-amber-200 bg-slate-950/50"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("feedback")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ${
                    rightTab === "feedback"
                      ? "border-amber-500 text-amber-200 bg-slate-950/50"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FileEdit className="w-3.5 h-3.5" aria-hidden />
                  Feedback opstellen
                  {feedbackDraft.trim() && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="Gevuld" />
                  )}
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {rightTab === "chat" ? (
                  <ChatPanel
                    sessionId={activeSessionId}
                    conversationId={activeConversationId}
                    conversationTitle={conversation?.title ?? ""}
                    model={model}
                    sourceReady={contextReady}
                    sources={sources}
                    pinnedSourceIds={pinnedSourceIds}
                    memory={memory}
                    messages={messages}
                    onMessagesChange={setMessages}
                    onCitationClick={onCitationClick}
                    onRenameConversation={handleRenameConversation}
                    onToggleSource={toggleContextSource}
                    onMemoryChange={(value) => {
                      memoryDirty.current = true;
                      setMemory(value);
                    }}
                    onSaveMemory={persistMemory}
                    onRemember={remember}
                    onAddToFeedback={addToFeedback}
                    selection={selection}
                    onClearSelection={() => setSelection(undefined)}
                  />
                ) : (
                  <FeedbackPanel
                    sessionId={activeSessionId}
                    conversationId={activeConversationId}
                    model={model}
                    sources={sources}
                    draft={feedbackDraft}
                    onDraftChange={(value) => {
                      feedbackDirty.current = true;
                      setFeedbackDraft(value);
                    }}
                    onSaveDraft={persistFeedback}
                    onCitationClick={onCitationClick}
                    selection={selection}
                    onClearSelection={() => setSelection(undefined)}
                  />
                )}
              </div>
            </section>
          }
        />
      </div>
      {newSessionOpen && (
        <NewSessionDialog
          library={library}
          onClose={() => setNewSessionOpen(false)}
          onFile={handleNewFile}
          onPaste={handleNewPaste}
          onExisting={handleNewExisting}
        />
      )}
    </div>
  );
}
