import { useEffect, useRef } from "react";
import { Folder, MessageSquare, Plus, Trash2 } from "lucide-react";
import type { SessionDto } from "../../types/domain";

interface Props {
  sessions: SessionDto[];
  activeSessionId: string | null;
  activeConversationId: string | null;
  confirmDeleteId: string | null;
  deletingId: string | null;
  confirmDeleteConversationId: string | null;
  onOpen: (id: string) => void;
  onOpenConversation: (sessionId: string, conversationId: string) => void;
  onCreateConversation: (sessionId: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
  onRequestDeleteConversation: (id: string) => void;
  onCancelDeleteConversation: () => void;
  onConfirmDeleteConversation: (sessionId: string, conversationId: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  activeConversationId,
  confirmDeleteId,
  deletingId,
  confirmDeleteConversationId,
  onOpen,
  onOpenConversation,
  onCreateConversation,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onRequestDeleteConversation,
  onCancelDeleteConversation,
  onConfirmDeleteConversation,
}: Props) {
  const activeItemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!activeSessionId) return;
    const frame = requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSessionId]);

  if (sessions.length === 0) {
    return <p className="px-3 py-4 text-xs text-slate-500 text-center">Nog geen sessies</p>;
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1 space-y-0.5 px-1.5">
      {sessions.map((s) => {
        const confirming = confirmDeleteId === s.id;
        const deleting = deletingId === s.id;
        const open = activeSessionId === s.id;
        return (
          <li
            key={s.id}
            ref={open ? activeItemRef : undefined}
            className={`rounded-md transition-colors ${open ? "bg-slate-800/70" : "hover:bg-slate-900/60"}`}
          >
            {confirming ? (
              <div className="p-2.5 space-y-2 rounded-md border border-red-900/50 bg-slate-900">
                <p className="text-xs text-slate-300 leading-snug">
                  <span className="font-medium text-slate-100">{s.title}</span> weggooien? Het bronbestand
                  blijft bewaard.
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => onConfirmDelete(s.id)}
                    className="flex-1 text-xs py-1 rounded bg-red-900/80 text-red-100 hover:bg-red-800 disabled:opacity-50 font-medium"
                  >
                    {deleting ? "…" : "Weggooien"}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={onCancelDelete}
                    className="flex-1 text-xs py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="group flex items-center min-h-[2.25rem] pr-1">
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    className={`flex-1 min-w-0 flex items-center gap-2 text-left px-2 py-1.5 text-sm truncate rounded-md ${
                      open ? "font-medium text-slate-100" : "text-slate-300 hover:text-slate-100"
                    }`}
                    title={s.title}
                  >
                    <Folder
                      className={`w-3.5 h-3.5 shrink-0 ${open ? "text-amber-400" : "text-slate-500"}`}
                      aria-hidden
                    />
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(s.id);
                    }}
                    className="p-1.5 rounded text-slate-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-400 hover:bg-slate-800 shrink-0 transition-opacity"
                    title="Sessie verwijderen"
                    aria-label={`Sessie ${s.title} verwijderen`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
                {open && (
                  <ul className="pb-2 pl-4 pr-1.5 space-y-0.5 border-l border-slate-700/60 ml-3.5">
                    {s.conversations.map((conversation) => {
                      const confirmingChat = confirmDeleteConversationId === conversation.id;
                      const activeChat = activeConversationId === conversation.id;
                      return (
                        <li key={conversation.id}>
                          {confirmingChat ? (
                            <div className="p-1.5 space-y-1.5 rounded bg-slate-900 border border-slate-800">
                              <p className="text-xs text-slate-300">Gesprek weggooien?</p>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => onConfirmDeleteConversation(s.id, conversation.id)}
                                  className="flex-1 text-xs py-0.5 rounded bg-red-900/80 text-red-100 hover:bg-red-800"
                                >
                                  Weg
                                </button>
                                <button
                                  type="button"
                                  onClick={onCancelDeleteConversation}
                                  className="flex-1 text-xs py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                  Nee
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group/chat flex items-center">
                              <button
                                type="button"
                                onClick={() => onOpenConversation(s.id, conversation.id)}
                                className={`flex-1 min-w-0 flex items-center gap-1.5 text-left px-2 py-1 text-xs truncate rounded ${
                                  activeChat
                                    ? "text-amber-200 bg-amber-500/10 font-medium"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                                }`}
                                title={conversation.title}
                              >
                                <MessageSquare className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
                                <span className="truncate">{conversation.title}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onRequestDeleteConversation(conversation.id)}
                                className="p-1 text-slate-500 opacity-0 group-hover/chat:opacity-100 focus:opacity-100 hover:text-red-400 rounded transition-opacity"
                                title="Gesprek verwijderen"
                                aria-label={`Gesprek ${conversation.title} verwijderen`}
                              >
                                <Trash2 className="w-3 h-3" aria-hidden />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    <li className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => onCreateConversation(s.id)}
                        className="w-full flex items-center gap-1.5 text-xs text-amber-400/90 hover:text-amber-300 hover:bg-slate-800/40 rounded px-2 py-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" aria-hidden />
                        Nieuw gesprek
                      </button>
                    </li>
                  </ul>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
