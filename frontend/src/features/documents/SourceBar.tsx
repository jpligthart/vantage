import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, FolderOpen, Plus, X } from "lucide-react";
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
  onToggleReference: (sourceId: string, isReference: boolean) => void;
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
  onToggleReference,
  onOpenLibrary,
}: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(sessionTitle);
  const menuRef = useRef<HTMLDivElement>(null);

  const attached = new Set(sources.map((source) => source.id));
  const others = library.filter((source) => !attached.has(source.id));

  useEffect(() => {
    setTitleDraft(sessionTitle);
  }, [sessionTitle]);

  useEffect(() => {
    if (!addMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
        setPickerOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [addMenuOpen]);

  return (
    <div className="border-b border-slate-800 bg-slate-900/90 shrink-0">
      {/* Row 1: Session header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderOpen className="w-4 h-4 text-amber-500/80 shrink-0" aria-hidden />
          <input
            className="w-full bg-transparent hover:bg-slate-800/60 focus:bg-slate-950 border border-transparent focus:border-slate-700 rounded px-1.5 py-0.5 text-sm font-semibold text-slate-100 outline-none transition-colors truncate"
            aria-label="Sessienaam"
            placeholder="Sessienaam…"
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
        <span className="text-[11px] text-slate-500 shrink-0">
          {sources.length} {sources.length === 1 ? "bron" : "bronnen"}
        </span>
      </div>

      {/* Row 2: Source tabs + Add button */}
      <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
          {sources.map((source) => {
            const active = source.id === activeSourceId;
            const isRef = Boolean(source.isReference);
            return (
              <div
                key={source.id}
                className={`group flex items-center max-w-[18rem] rounded-md border text-xs transition-colors ${
                  active
                    ? "border-amber-500/80 bg-amber-500/10 text-amber-100 font-medium"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(source.id)}
                  className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 truncate text-left"
                  title={source.name}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">
                    {source.status === "failed" ? "⚠ " : ""}
                    {source.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleReference(source.id, !isRef)}
                  title={
                    isRef
                      ? "Gemarkeerd als referentiekader (bijv. leerdoelen / HBO-i / beleid). Klik om weer als studentenwerk te markeren."
                      : "Markeer als kader / richtlijn (bijv. leerdoelen, HBO-i, beleidsinfo)"
                  }
                  className={`px-1.5 py-0.5 my-0.5 rounded text-[10px] font-medium border transition-colors shrink-0 ${
                    isRef
                      ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                      : "border-transparent text-slate-500 opacity-0 group-hover:opacity-100 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  Kader
                </button>
                <button
                  type="button"
                  onClick={() => onDetach(source.id)}
                  className="pr-2 pl-1 py-1 text-slate-500 hover:text-red-400 transition-colors"
                  title="Loskoppelen van deze sessie"
                  aria-label={`${source.name} loskoppelen`}
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add source popover */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setAddMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-dashed border-slate-700 text-slate-300 hover:border-amber-500/60 hover:text-amber-200 hover:bg-slate-800/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Bron toevoegen
          </button>

          {addMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 px-2 py-0.5">
                Aan deze sessie koppelen
              </div>
              <ImportActions
                compact
                heading=""
                hint={null}
                onFile={(file) => {
                  setAddMenuOpen(false);
                  onFile(file);
                }}
                onPasteText={(text, title) => {
                  setAddMenuOpen(false);
                  onPasteText(text, title);
                }}
              />
              <button
                type="button"
                className="w-full flex items-center gap-2 text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-left transition-colors"
                onClick={() => {
                  setPickerOpen((open) => !open);
                  onOpenLibrary();
                }}
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                Bestaande bron kiezen…
              </button>

              {pickerOpen && (
                <div className="pt-1 border-t border-slate-800 max-h-40 overflow-y-auto">
                  {others.length === 0 ? (
                    <p className="text-xs text-slate-500 px-2 py-1.5">Geen andere bronnen beschikbaar.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {others.map((source) => (
                        <li key={source.id}>
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-1.5 text-left text-xs px-2 py-1.5 rounded hover:bg-slate-800 text-slate-300"
                            onClick={() => {
                              onAttachExisting(source.id);
                              setPickerOpen(false);
                              setAddMenuOpen(false);
                            }}
                          >
                            <span className="truncate">{source.name}</span>
                            {source.isReference && (
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/50 text-sky-200">
                                Kader
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
