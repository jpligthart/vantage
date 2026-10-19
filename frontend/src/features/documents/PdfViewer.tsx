import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { CitationDto } from "../../types/domain";
import { sourceContentUrl } from "../../services/api";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const SCALE = 1.25;

interface Props {
  sourceId: string;
  highlight?: CitationDto | null;
  onTextSelect?: (text: string) => void;
}

export function PdfViewer({ sourceId, highlight, onTextSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const pdf = await pdfjs.getDocument(sourceContentUrl(sourceId)).promise;
        if (cancelled || !containerRef.current) return;
        setPageCount(pdf.numPages);
        containerRef.current.innerHTML = "";

        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          const page = await pdf.getPage(pageNo);
          if (cancelled || !containerRef.current) return;

          const viewport = page.getViewport({ scale: SCALE });
          const pageWrap = document.createElement("div");
          pageWrap.className = "pdf-page mb-6 flex flex-col items-center";
          pageWrap.dataset.pageNumber = String(pageNo);

          const label = document.createElement("div");
          label.className = "text-xs text-slate-500 mb-1 w-full max-w-[800px] px-1";
          label.textContent = `Pagina ${pageNo} / ${pdf.numPages}`;
          pageWrap.appendChild(label);

          const canvasWrap = document.createElement("div");
          canvasWrap.className = "relative inline-block shadow-md bg-white";
          canvasWrap.style.width = `${viewport.width}px`;
          canvasWrap.style.height = `${viewport.height}px`;

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          canvasWrap.appendChild(canvas);

          const textContent = await page.getTextContent();
          const textLayer = document.createElement("div");
          textLayer.className = "pdf-text-layer absolute inset-0 overflow-hidden opacity-100";
          textLayer.style.width = `${viewport.width}px`;
          textLayer.style.height = `${viewport.height}px`;

          for (const item of textContent.items) {
            if (!("str" in item) || !item.str) continue;
            const tx = pdfjs.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.position = "absolute";
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = "sans-serif";
            span.style.color = "transparent";
            span.style.whiteSpace = "pre";
            span.style.cursor = "text";
            textLayer.appendChild(span);
          }
          canvasWrap.appendChild(textLayer);
          pageWrap.appendChild(canvasWrap);
          containerRef.current.appendChild(pageWrap);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "PDF laden mislukt");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    root.querySelectorAll(".pdf-highlight").forEach((el) => el.remove());

    if (!highlight?.pageNo || !highlight.bbox) return;

    const pageEl = root.querySelector(`[data-page-number="${highlight.pageNo}"]`);
    const canvasWrap = pageEl?.querySelector(".relative.inline-block");
    if (!(canvasWrap instanceof HTMLElement) || !highlight.bbox) return;

    const { l, t, r, b } = highlight.bbox;
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    const overlay = document.createElement("div");
    overlay.className = "pdf-highlight pointer-events-none absolute border-2 border-amber-500 bg-amber-500/25";
    overlay.style.left = `${l * w}px`;
    overlay.style.top = `${t * h}px`;
    overlay.style.width = `${(r - l) * w}px`;
    overlay.style.height = `${(b - t) * h}px`;
    canvasWrap.appendChild(overlay);
    pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, pageCount, loading]);

  function handleMouseUp() {
    if (!onTextSelect) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || !containerRef.current) return;
    const anchor = sel?.anchorNode;
    if (anchor && containerRef.current.contains(anchor)) {
      onTextSelect(text);
    }
  }

  if (error) {
    return <p className="text-red-400 p-4">{error}</p>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {loading && (
        <p className="text-slate-500 text-sm p-4">PDF laden ({pageCount ? `${pageCount} pagina’s` : "…"})</p>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 bg-slate-950/50"
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}
