import type { SessionDto } from "../../types/domain";

interface Props {
  sessions: SessionDto[];
  activeSessionId: string | null;
  confirmDeleteId: string | null;
  deletingId: string | null;
  onOpen: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  confirmDeleteId,
  deletingId,
  onOpen,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  if (sessions.length === 0) {
    return <p className="px-3 py-2 text-xs text-slate-600">Nog geen sessies</p>;
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {sessions.map((s) => {
        const confirming = confirmDeleteId === s.id;
        const deleting = deletingId === s.id;
        return (
          <li
            key={s.id}
            className={`border-b border-slate-800/50 ${activeSessionId === s.id ? "bg-slate-800/60" : ""}`}
          >
            {confirming ? (
              <div className="px-2 py-2 space-y-2">
                <p className="text-xs text-slate-300 leading-snug">
                  <span className="font-medium text-slate-200">{s.title}</span> weggooien? Het bronbestand
                  blijft bewaard.
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => onConfirmDelete(s.id)}
                    className="flex-1 text-xs py-1 rounded bg-red-900/80 text-red-100 hover:bg-red-800 disabled:opacity-50"
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
              <div className="flex items-stretch min-h-[2.5rem]">
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-slate-800 truncate"
                  title={s.title}
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(s.id);
                  }}
                  className="px-2.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 shrink-0 text-lg leading-none"
                  title="Sessie verwijderen"
                  aria-label={`Sessie ${s.title} verwijderen`}
                >
                  ×
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
