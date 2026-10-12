import { useEffect, useRef } from "react";
import type { CitationDto } from "../../types/domain";
import { sourcePreviewUrl } from "../../services/api";

interface Props {
  sourceId: string;
  highlight?: CitationDto | null;
}

export function DocxViewer({ sourceId, highlight }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!highlight?.chunkId || !frameRef.current) return;
    const doc = frameRef.current.contentDocument;
    if (!doc) return;
    const anchorId = highlight.anchorId || highlight.chunkId;
    const anchor = doc.getElementById(anchorId) || doc.querySelector(`[id="${anchorId}"]`);
    anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (anchor instanceof HTMLElement) {
      anchor.style.outline = "2px solid #f59e0b";
    }
  }, [highlight, sourceId]);

  return (
    <iframe
      ref={frameRef}
      title="Document preview"
      src={sourcePreviewUrl(sourceId)}
      className="w-full h-full border-0 bg-white"
    />
  );
}
