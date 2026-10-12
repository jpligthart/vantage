import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { CitationDto } from "../../types/domain";
import { sourceContentUrl } from "../../services/api";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface Props {
  sourceId: string;
  highlight?: CitationDto | null;
}

export function PdfViewer({ sourceId, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const pdf = await pdfjs.getDocument(sourceContentUrl(sourceId)).promise;
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const pageNo = highlight?.pageNo ?? 1;
        const page = await pdf.getPage(Math.min(pageNo, pdf.numPages));
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        containerRef.current.appendChild(canvas);

        if (highlight?.bbox) {
          const { l, t, r, b } = highlight.bbox;
          const overlay = document.createElement("div");
          overlay.style.position = "absolute";
          overlay.style.left = `${l * viewport.width}px`;
          overlay.style.top = `${t * viewport.height}px`;
          overlay.style.width = `${(r - l) * viewport.width}px`;
          overlay.style.height = `${(b - t) * viewport.height}px`;
          overlay.style.border = "2px solid #f59e0b";
          overlay.style.background = "rgba(245,158,11,0.2)";
          overlay.style.pointerEvents = "none";
          const wrap = document.createElement("div");
          wrap.style.position = "relative";
          wrap.style.display = "inline-block";
          wrap.appendChild(canvas);
          wrap.appendChild(overlay);
          containerRef.current.appendChild(wrap);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "PDF laden mislukt");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sourceId, highlight]);

  if (error) {
    return <p className="text-red-400 p-4">{error}</p>;
  }

  return <div ref={containerRef} className="overflow-auto p-4 flex justify-center" />;
}
