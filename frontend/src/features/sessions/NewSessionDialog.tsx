import { useEffect, useRef, useState } from "react";
import type { SourceDto } from "../../types/domain";

interface Props {
  library: SourceDto[];
  onClose: () => void;
  onFile: (file: File, sessionName: string) => void;
  onPaste: (text: string, pasteTitle: string | undefined, sessionName: string) => void;
  onExisting: (source: SourceDto, sessionName: string) => void;
}

export function NewSessionDialog({ library, onClose, onFile, onPaste, onExisting }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sessionName, setSessionName] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pasteFromClipboard() {
    setPasteError(null);
    setLibraryOpen(false);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteError("Clipboard is leeg.");
        setPasteOpen(true);
        return;
      }
      setPasteBody(text);
      setPasteOpen(true);
    } catch {
      setPasteError("Geen clipboard-toegang — plak handmatig.");
      setPasteOpen(true);
    }
  }

  function submitPaste() {
    if (!pasteBody.trim()) {
      setPasteError("Voer tekst in.");
      return;
    }
    onPaste(pasteBody, pasteTitle.trim() || undefined, sessionName.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg p-4 space-y-3 shadow-xl">
        <h2 id="new-session-title" className="text-sm font-medium">Nieuwe sessie</h2>
        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Naam, leeg laten mag</span>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
            placeholder="Anders de naam van het bestand"
            value={sessionName}
            onChange={(event) => setSessionName(event.target.value)}
            autoFocus
          />
        </label>
        <p className="text-xs text-slate-500">Eerste bron</p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="text-sm px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700"
            onClick={() => inputRef.current?.click()}
          >
            Bestand kiezen…
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file, sessionName.trim());
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="text-sm px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700"
            onClick={pasteFromClipboard}
          >
            Tekst plakken
          </button>
          <button
            type="button"
            className="text-sm px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700"
            onClick={() => {
              setLibraryOpen((open) => !open);
              setPasteOpen(false);
            }}
          >
            Bestaande bron
          </button>
        </div>
        {pasteError && <p className="text-xs text-amber-400">{pasteError}</p>}
        {pasteOpen && (
          <div className="space-y-2">
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              placeholder="Titel van de tekst (optioneel)"
              value={pasteTitle}
              onChange={(event) => setPasteTitle(event.target.value)}
            />
            <textarea
              className="w-full h-40 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              placeholder="Plak of typ de tekst…"
              value={pasteBody}
              onChange={(event) => setPasteBody(event.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-amber-600"
                onClick={submitPaste}
              >
                Sessie starten
              </button>
            </div>
          </div>
        )}
        {libraryOpen && (
          <div className="max-h-40 overflow-y-auto border border-slate-800 rounded">
            {library.length === 0 ? (
              <p className="text-xs text-slate-500 px-2 py-2">Nog geen bronnen.</p>
            ) : (
              <ul>
                {library.map((source) => (
                  <li key={source.id}>
                    <button
                      type="button"
                      className="w-full text-left text-xs px-2 py-1.5 hover:bg-slate-800 truncate"
                      onClick={() => onExisting(source, sessionName.trim())}
                    >
                      {source.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" className="text-sm px-3 py-1 rounded bg-slate-800" onClick={onClose}>
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
