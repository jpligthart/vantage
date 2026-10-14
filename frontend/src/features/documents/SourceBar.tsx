import { useEffect, useState } from "react";
import { ImportActions } from "../import/ImportActions";
import type { SourceDto } from "../../types/domain";

interface Props {
  sources: SourceDto[];
  activeSourceId: string | null;
  sessionTitle: string;
  library: SourceDto[];
  onRenameSession: (title: string) => void;
  onSelect: (sourceId: string) => void;
  onDetach: (sourceId: string) => void;
  onFile: (file: File) => void;
  onPasteText: (text: string, title?: string) => void;
  onAttachExisting: (sourceId: string) => void;
  onOpenLibrary: () => void;
}

export function SourceBar({
  sources,
  activeSourceId,
  sessionTitle,
  library,
  onRenameSession,
  onSelect,
  onDetach,
  onFile,
  onPasteText,
  onAttachExisting,
  onOpenLibrary,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sessionTitle);
  const attached = new Set(sources.map((source) => source.id));
  const others = library.filter((source) => !attached.has(source.id));

  useEffect(() => {
    setTitleDraft(sessionTitle);
  }, [sessionTitle]);

  return (
    <div className="border-b border-slate-800 bg-slate-900/80 shrink-0">
      <div className="px-2 py-1.5">
        <input
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
          aria-label="Sessienaam"
          placeholder="Sessienaam"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={(e) => {
            const next = e.currentTarget.value.trim();
            if (next && next !== sessionTitle) onRenameSession(next);
            else setTitleDraft(sessionTitle);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="flex gap-1 overflow-x-auto px-2 pb-1">
        {sources.map((source) => {
          const active = source.id === activeSourceId;
          return (
            <div
              key={source.id}
              className={`flex items-center max-w-[14rem] rounded border ${
                active ? "border-amber-600 bg-slate-800" : "border-slate-700 bg-slate-950"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(source.id)}
                className="px-2 py-1 text-xs truncate text-left"
                title={source.name}
              >
                {source.status === "failed" ? "⚠ " : ""}
                {source.name}
              </button>
              <button
                type="button"
                onClick={() => onDetach(source.id)}
                className="px-1.5 text-slate-500 hover:text-red-400 text-sm"
                title="Loskoppelen van deze sessie"
                aria-label={`${source.name} loskoppelen`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
        <ImportActions
          compact
          heading="Aan deze sessie"
          hint={null}
          onFile={onFile}
          onPasteText={onPasteText}
        />
        <button
          type="button"
          className="text-sm px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700"
          onClick={() => {
            setPickerOpen((open) => !open);
            onOpenLibrary();
          }}
        >
          Bestaande bron
        </button>
      </div>
      {pickerOpen && (
        <div className="px-2 pb-2 max-h-40 overflow-y-auto">
          {others.length === 0 ? (
            <p className="text-xs text-slate-500">Geen andere bronnen.</p>
          ) : (
            <ul className="space-y-1">
              {others.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-slate-800 truncate"
                    onClick={() => {
                      onAttachExisting(source.id);
                      setPickerOpen(false);
                    }}
                  >
                    {source.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
