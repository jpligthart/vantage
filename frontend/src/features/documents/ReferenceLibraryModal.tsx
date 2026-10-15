import { useEffect, useRef, useState } from "react";
import { BookMarked, FileText, Pin, Plus, Search, Trash2, Upload, X } from "lucide-react";
import type { SourceDto } from "../../types/domain";

interface Props {
  sources: SourceDto[];
  activeSessionSourceIds: string[];
  hasActiveSession: boolean;
  onClose: () => void;
  onUploadDefault: (file: File) => Promise<void>;
  onPasteDefault: (text: string, title?: string) => Promise<void>;
  onToggleDefault: (sourceId: string, isDefault: boolean) => Promise<void>;
  onToggleReference: (sourceId: string, isReference: boolean) => Promise<void>;
  onAttachToCurrentSession: (sourceId: string) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
}

export function ReferenceLibraryModal({
  sources,
  activeSessionSourceIds,
  hasActiveSession,
  onClose,
  onUploadDefault,
  onPasteDefault,
  onToggleDefault,
  onToggleReference,
  onAttachToCurrentSession,
  onDeleteSource,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const attachedSet = new Set(activeSessionSourceIds);
  const q = searchQuery.trim().toLowerCase();

  // Only show reference / context documents here so student uploads never flood this modal
  const referenceSources = sources.filter(
    (s) => (s.isReference || s.isDefault) && (!q || s.name.toLowerCase().includes(q)),
  );
  const defaultSources = referenceSources.filter((s) => s.isDefault);
  const optionalReferenceSources = referenceSources.filter((s) => !s.isDefault);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await onUploadDefault(file);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteBody.trim()) return;
    setBusy(true);
    try {
      await onPasteDefault(pasteBody, pasteTitle.trim() || undefined);
      setPasteTitle("");
      setPasteBody("");
      setPasteOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function renderSourceRow(source: SourceDto) {
    const isDefault = Boolean(source.isDefault);
    const isAttached = attachedSet.has(source.id);

    return (
      <li
        key={source.id}
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-slate-800 bg-slate-950/60 hover:border-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-sky-400/80 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-200 truncate" title={source.name}>
              {source.name}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>{source.type.toUpperCase()}</span>
              {source.status !== "ready" && (
                <span className="text-amber-400">
                  {source.status === "failed" ? "Mislukt" : "Verwerken…"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleDefault(source.id, !isDefault)}
            title={
              isDefault
                ? "Wordt automatisch gekoppeld aan elke nieuwe sessie. Klik om alleen handmatig te koppelen."
                : "Klik om dit document voortaan automatisch aan elke nieuwe sessie te koppelen"
            }
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
              isDefault
                ? "border-amber-500/70 bg-amber-500/15 text-amber-200"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Pin className="w-3 h-3" aria-hidden />
            {isDefault ? "Altijd meesturen" : "Optioneel"}
          </button>

          {hasActiveSession && !isAttached && (
            <button
              type="button"
              onClick={() => onAttachToCurrentSession(source.id)}
              title="Direct toevoegen aan de nu geopende sessie"
              className="px-2 py-1 rounded text-[11px] border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              + Huidige sessie
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              if (source.isDefault) await onToggleDefault(source.id, false);
              await onToggleReference(source.id, false);
            }}
            title="Niet langer als referentie/context gebruiken (terugzetten naar gewoon document)"
            className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Geen referentie
          </button>

          {confirmDeleteId === source.id ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  await onDeleteSource(source.id);
                  setConfirmDeleteId(null);
                }}
                className="px-2 py-1 rounded text-[11px] bg-red-600 hover:bg-red-500 text-white"
              >
                Zeker
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-1.5 py-1 rounded text-[11px] bg-slate-800 text-slate-300"
              >
                Nee
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(source.id)}
              title="Definitief verwijderen"
              className="p-1 text-slate-500 hover:text-red-400 transition-colors"
              aria-label={`${source.name} verwijderen`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reference-library-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-amber-400" aria-hidden />
            <h2 id="reference-library-title" className="text-sm font-semibold text-slate-100">
              Referentie &amp; Contextdocumenten
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
            aria-label="Sluiten"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs font-semibold text-slate-200">
                  Nieuw contextdocument toevoegen (bijv. HBO-i, beleidsdocument, leerdoelen)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Het AI-model krijgt dit document als <strong className="text-sky-300 font-normal">achtergrond/richtlijn</strong>{" "}
                  (dus niet als tekst van de student) en neemt het standaard mee in elke nieuwe sessie.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden />
                  PDF / DOCX uploaden
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPasteOpen((open) => !open)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  Tekst plakken
                </button>
              </div>
            </div>

            {pasteOpen && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
                  placeholder="Titel (bijv. HBO-i Domeinbeschrijving of Beleid Afstuderen)"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
                <textarea
                  className="w-full h-32 bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-100"
                  placeholder="Plak hier de tekst van het contextdocument, beleid of kader…"
                  value={pasteBody}
                  onChange={(e) => setPasteBody(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPasteOpen(false)}
                    className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300"
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    disabled={busy || !pasteBody.trim()}
                    onClick={handlePasteSubmit}
                    className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium"
                  >
                    Opslaan als vaste context
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek in referentie- en contextdocumenten…"
              className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 outline-none"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
              Altijd meesturen in nieuwe sessies ({defaultSources.length})
            </h3>
            {defaultSources.length === 0 ? (
              <p className="text-xs text-slate-500 py-1.5">
                Geen vaste contextdocumenten ingesteld. Upload hierboven een bestand of zet een document op{" "}
                <span className="text-slate-300">Altijd meesturen</span>.
              </p>
            ) : (
              <ul className="space-y-1.5">{defaultSources.map(renderSourceRow)}</ul>
            )}
          </div>

          {optionalReferenceSources.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Optionele referentiedocumenten ({optionalReferenceSources.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Wel gemarkeerd als referentie/context, maar worden niet automatisch aan elke nieuwe sessie gekoppeld.
              </p>
              <ul className="space-y-1.5">{optionalReferenceSources.map(renderSourceRow)}</ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 text-[11px] text-slate-500">
          <span>Studentverslagen worden hier bewust niet getoond.</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
