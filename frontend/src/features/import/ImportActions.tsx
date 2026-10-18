import { useRef, useState } from "react";
import { ClipboardPaste, Globe, Upload } from "lucide-react";

interface Props {
  onFile: (file: File) => void;
  onPasteText: (text: string, title?: string) => void;
  onWebUrl?: (url: string, mode: "page" | "site", title?: string) => void;
  disabled?: boolean;
  heading?: string;
  hint?: string | null;
  compact?: boolean;
}

export function ImportActions({
  onFile,
  onPasteText,
  onWebUrl,
  disabled,
  heading = "Bron toevoegen",
  hint = "Of sleep PDF/DOCX op het venster",
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [webOpen, setWebOpen] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const [webTitle, setWebTitle] = useState("");
  const [webMode, setWebMode] = useState<"page" | "site">("site");
  const [webError, setWebError] = useState<string | null>(null);

  async function pasteFromClipboard() {
    setPasteError(null);
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
      setPasteError("Geen clipboard-toegang — plak handmatig in het venster.");
      setPasteOpen(true);
    }
  }

  function submitPaste() {
    if (!pasteBody.trim()) {
      setPasteError("Voer tekst in.");
      return;
    }
    onPasteText(pasteBody, pasteTitle.trim() || undefined);
    setPasteOpen(false);
    setPasteBody("");
    setPasteTitle("");
    setPasteError(null);
  }

  function submitWeb() {
    const url = webUrl.trim();
    if (!url) {
      setWebError("Voer een URL in.");
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setWebError("Alleen http(s) URLs.");
        return;
      }
    } catch {
      setWebError("Ongeldige URL.");
      return;
    }
    onWebUrl?.(url, webMode, webTitle.trim() || undefined);
    setWebOpen(false);
    setWebUrl("");
    setWebTitle("");
    setWebMode("site");
    setWebError(null);
  }

  return (
    <div className={compact ? "flex flex-col gap-1" : "p-2 space-y-2 border-t border-slate-800"}>
      {heading ? <p className="text-xs text-slate-500 w-full">{heading}</p> : null}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 text-left transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
          Bestand kiezen…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 text-left transition-colors"
          onClick={pasteFromClipboard}
        >
          <ClipboardPaste className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
          Plakken vanaf clipboard
        </button>
        {onWebUrl ? (
          <button
            type="button"
            disabled={disabled}
            className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 text-left transition-colors"
            onClick={() => {
              setWebError(null);
              setWebOpen(true);
            }}
          >
            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
            URL / website…
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-slate-600 w-full">{hint}</p> : null}

      {pasteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-dialog-title"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg p-4 space-y-3 shadow-xl">
            <h2 id="paste-dialog-title" className="text-sm font-medium">Tekst importeren</h2>
            {pasteError && <p className="text-xs text-amber-400">{pasteError}</p>}
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              placeholder="Titel (optioneel)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              className="w-full h-48 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-mono"
              placeholder="Plak of typ je tekst hier…"
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-slate-800"
                onClick={() => setPasteOpen(false)}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-amber-600"
                onClick={submitPaste}
              >
                Importeren
              </button>
            </div>
          </div>
        </div>
      )}

      {webOpen && onWebUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="web-dialog-title"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg p-4 space-y-3 shadow-xl">
            <h2 id="web-dialog-title" className="text-sm font-medium">
              Website of DokuWiki importeren
            </h2>
            <p className="text-[11px] text-slate-400">
              Snapshot wordt opgeslagen en is doorzoekbaar in de chat. Eén pagina werkt voor elke
              publieke URL; meerdere pagina&apos;s alleen voor DokuWiki.
            </p>
            {webError && <p className="text-xs text-amber-400">{webError}</p>}
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              placeholder="https://wiki.example.com/doku.php?id=start"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              autoFocus
            />
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm"
              placeholder="Titel (optioneel)"
              value={webTitle}
              onChange={(e) => setWebTitle(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                  webMode === "page"
                    ? "border-amber-500/70 bg-amber-500/15 text-amber-100"
                    : "border-slate-700 bg-slate-950 text-slate-400"
                }`}
                onClick={() => setWebMode("page")}
              >
                Website (1 pagina)
              </button>
              <button
                type="button"
                className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                  webMode === "site"
                    ? "border-amber-500/70 bg-amber-500/15 text-amber-100"
                    : "border-slate-700 bg-slate-950 text-slate-400"
                }`}
                onClick={() => setWebMode("site")}
              >
                DokuWiki (meerdere pagina&apos;s)
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-slate-800"
                onClick={() => setWebOpen(false)}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-amber-600"
                onClick={submitWeb}
              >
                Importeren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
