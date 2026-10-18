import { Download } from "lucide-react";
import { sourceContentUrl } from "../../services/api";
import type { SourceDto } from "../../types/domain";

interface Props {
  source: SourceDto;
}

export function DocumentChrome({ source }: Props) {
  const downloadUrl = sourceContentUrl(source.id);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800/80 bg-slate-950/60 text-xs shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] uppercase tracking-wider shrink-0">
          {source.type}
        </span>
        <span className="text-slate-400 truncate">
          {source.type === "pdf"
            ? "Originele weergave — scroll door alle pagina's"
            : source.type === "web"
              ? `Web-snapshot${source.pageCount != null ? ` (${source.pageCount} pagina's)` : ""}`
              : "Tekstweergave — layout kan afwijken"}
        </span>
      </div>
      <a
        href={downloadUrl}
        download={source.name}
        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" aria-hidden />
        Download origineel
      </a>
    </div>
  );
}
