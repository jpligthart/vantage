import { useEffect, useState } from "react";
import { Bot, Check, Copy, Loader2, Pencil, RotateCcw, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CitationDto, MessageDto } from "../../types/domain";
import { citationTooltip, formatCitationLabel, sortCitations } from "../../lib/citations";
import { cn } from "../../lib/utils";

interface Props {
  message: MessageDto;
  disabled?: boolean;
  onCitationClick: (c: CitationDto) => void;
  onRemember?: (content: string) => void;
  onAddToFeedback?: (content: string) => void;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function ChatMessage({
  message,
  disabled = false,
  onCitationClick,
  onRemember,
  onAddToFeedback,
  onRetry,
  onEdit,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const isUser = message.role === "user";

  useEffect(() => {
    setEditDraft(message.content);
  }, [message.content]);

  async function handleCopy() {
    await copyText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function submitEdit() {
    const trimmed = editDraft.trim();
    if (!trimmed || !onEdit) return;
    setEditing(false);
    onEdit(trimmed);
  }

  const isStreaming = message.id === "streaming";
  const isThinking = isStreaming && !message.content.trim();
  const isPersisted = !isStreaming && !message.id.startsWith("temp-");

  return (
    <div
      className={cn(
        "group relative flex text-sm",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "min-w-0 max-w-[min(100%,42rem)]",
          isUser ? (editing ? "w-full max-w-[min(100%,36rem)]" : "max-w-[min(100%,85%)]") : "w-full max-w-full",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 mb-1",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          {isUser ? (
            <>
              {isPersisted && !editing && onEdit && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setEditDraft(message.content);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-300 disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Pas deze vraag aan en genereer vanaf dit punt een nieuw antwoord"
                >
                  <Pencil className="w-3 h-3" aria-hidden />
                  Bewerken
                </button>
              )}
              {isPersisted && !editing && onRetry && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-300 disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Stel deze vraag opnieuw (met de huidig gekozen modus en het huidige model)"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden />
                  Opnieuw
                </button>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-300/90">
                <User className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Jij
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-200/90">
                <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Assistent
              </span>
              {!isStreaming && onRemember && (
                <button
                  type="button"
                  onClick={() => onRemember(message.content)}
                  className="text-xs text-slate-500 hover:text-amber-300"
                  title="Zet dit antwoord in het sessiegeheugen"
                >
                  In geheugen
                </button>
              )}
              {!isStreaming && onAddToFeedback && (
                <button
                  type="button"
                  onClick={() => onAddToFeedback(message.content)}
                  className="text-xs text-slate-500 hover:text-sky-300"
                  title="Voeg dit antwoord toe aan het feedbackconcept"
                >
                  Naar feedback
                </button>
              )}
              {isPersisted && onRetry && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-300 disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  title="Genereer dit antwoord opnieuw (met de huidig gekozen modus en het huidige model)"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden />
                  Opnieuw
                </button>
              )}
              {!isThinking && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ml-auto"
                  title="Kopiëren"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden />
                      Gekopieerd
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden />
                      Kopiëren
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {isUser ? (
          editing ? (
            <div className="rounded-2xl rounded-tr-md p-2.5 bg-slate-900 border border-amber-500/60 shadow-sm space-y-2">
              <textarea
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500/60 rounded p-2 text-sm text-slate-100 min-h-[68px] outline-none"
                value={editDraft}
                autoFocus
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") {
                    setEditing(false);
                    setEditDraft(message.content);
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1.5 text-xs">
                <span className="text-[11px] text-slate-500 mr-auto">
                  Latere berichten in dit gesprek worden vervangen
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(message.content);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-3 h-3" aria-hidden />
                  Annuleren
                </button>
                <button
                  type="button"
                  disabled={!editDraft.trim() || disabled}
                  onClick={submitEdit}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-medium"
                >
                  Opnieuw versturen
                </button>
              </div>
            </div>
          ) : (
            <div
              className="whitespace-pre-wrap rounded-2xl rounded-tr-md px-3 py-2 bg-sky-950/80 text-slate-100 border border-sky-700/45 shadow-sm"
            >
              {message.content}
            </div>
          )
        ) : (
          <div
            className={cn(
              "chat-md rounded-2xl rounded-tl-md px-3 py-2 text-slate-100",
              "bg-slate-800/55 border border-slate-600/50 border-l-[3px] border-l-amber-500/70",
              isStreaming && "border-l-amber-400",
            )}
          >
            {isThinking ? (
              <div className="flex items-center gap-2 py-0.5 text-slate-300 text-xs">
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" aria-hidden />
                <span>Bronnen lezen en antwoord opbouwen…</span>
                <span className="inline-flex items-center gap-1 ml-0.5" aria-hidden>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-bounce" />
                </span>
              </div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            )}
          </div>
        )}

        {!isUser && message.contextStrategy === "full_document" && (
          <div className="text-xs text-slate-500 mt-1.5 pl-0.5">Gebaseerd op de volledige broncontext</div>
        )}
        {!isUser && message.citations?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {sortCitations(message.citations).map((c, i) => (
              <button
                key={`${c.chunkId}-${i}`}
                type="button"
                onClick={() => onCitationClick(c)}
                title={citationTooltip(c)}
                className="text-xs max-w-[min(100%,16rem)] truncate px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600 hover:border-amber-500 text-left"
              >
                {formatCitationLabel(c)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
