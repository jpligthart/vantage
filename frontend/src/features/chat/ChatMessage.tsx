import { useState } from "react";
import { Bot, Check, Copy, Loader2, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CitationDto, MessageDto } from "../../types/domain";
import { citationTooltip, formatCitationLabel, sortCitations } from "../../lib/citations";
import { cn } from "../../lib/utils";

interface Props {
  message: MessageDto;
  onCitationClick: (c: CitationDto) => void;
  onRemember?: (content: string) => void;
  onAddToFeedback?: (content: string) => void;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function ChatMessage({ message, onCitationClick, onRemember, onAddToFeedback }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function handleCopy() {
    await copyText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const isStreaming = message.id === "streaming";
  const isThinking = isStreaming && !message.content.trim();

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
          isUser ? "max-w-[min(100%,85%)]" : "w-full max-w-full",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 mb-1",
            isUser ? "justify-end flex-row-reverse" : "justify-start",
          )}
        >
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              isUser ? "text-sky-300/90" : "text-amber-200/90",
            )}
          >
            {isUser ? (
              <User className="w-3.5 h-3.5 shrink-0" aria-hidden />
            ) : (
              <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden />
            )}
            {isUser ? "Jij" : "Assistent"}
          </span>
          {!isUser && !isStreaming && onRemember && (
            <button
              type="button"
              onClick={() => onRemember(message.content)}
              className="text-xs text-slate-500 hover:text-amber-300"
              title="Zet dit antwoord in het sessiegeheugen"
            >
              In geheugen
            </button>
          )}
          {!isUser && !isStreaming && onAddToFeedback && (
            <button
              type="button"
              onClick={() => onAddToFeedback(message.content)}
              className="text-xs text-slate-500 hover:text-sky-300"
              title="Voeg dit antwoord toe aan het feedbackconcept"
            >
              Naar feedback
            </button>
          )}
          {!isUser && !isThinking && (
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
        </div>

        {isUser ? (
          <div
            className="whitespace-pre-wrap rounded-2xl rounded-tr-md px-3 py-2 bg-sky-950/80 text-slate-100 border border-sky-700/45 shadow-sm"
          >
            {message.content}
          </div>
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
