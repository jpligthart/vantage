import { sourceContentUrl } from "../../services/api";
import type { SourceDto } from "../../types/domain";

interface Props {
  source: SourceDto;
}

export function DocumentChrome({ source }: Props) {
  const downloadUrl = sourceContentUrl(source.id);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/80 text-xs shrink-0">
      <span className="truncate text-slate-300" title={source.name}>
        {source.name}
        <span className="text-slate-500">
          {source.type === "pdf"
            ? " — origineel, scroll door alle pagina's"
            : " — tekstweergave, layout kan afwijken"}
        </span>
      </span>
      <a
        href={downloadUrl}
        download={source.name}
        className="text-amber-400 hover:underline whitespace-nowrap shrink-0"
      >
        Download origineel
      </a>
    </div>
  );
}
