import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface Props {
  storageKey: string;
  /** Fraction of total width for the trailing (right) column, 0–1. */
  defaultTrailingRatio: number;
  leadingMinPx: number;
  trailingMinPx: number;
  leading: React.ReactNode;
  trailing: React.ReactNode;
  /** When true, only the trailing column is shown (leading + splitter stay mounted but hidden). */
  leadingHidden?: boolean;
  className?: string;
}

function clampRatio(
  ratio: number,
  containerWidth: number,
  leadingMinPx: number,
  trailingMinPx: number,
): number {
  if (containerWidth <= 0) return ratio;
  const minTrailing = trailingMinPx / containerWidth;
  const maxTrailing = 1 - leadingMinPx / containerWidth;
  return Math.min(maxTrailing, Math.max(minTrailing, ratio));
}

function readStoredRatio(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function ResizableColumns({
  storageKey,
  defaultTrailingRatio,
  leadingMinPx,
  trailingMinPx,
  leading,
  trailing,
  leadingHidden = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [trailingRatio, setTrailingRatio] = useState(() =>
    readStoredRatio(storageKey, defaultTrailingRatio),
  );
  const dragging = useRef(false);

  const persistRatio = useCallback(
    (ratio: number) => {
      setTrailingRatio(ratio);
      try {
        localStorage.setItem(storageKey, String(ratio));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current || leadingHidden) return;
      const rect = containerRef.current.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const ratio = fromRight / rect.width;
      persistRatio(clampRatio(ratio, rect.width, leadingMinPx, trailingMinPx));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [leadingMinPx, trailingMinPx, persistRatio, leadingHidden]);

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function resetSplit() {
    persistRatio(defaultTrailingRatio);
  }

  const leadFr = 1 - trailingRatio;
  const trailFr = trailingRatio;

  return (
    <div
      ref={containerRef}
      className={cn("grid flex-1 min-h-0 min-w-0", className)}
      style={{
        gridTemplateColumns: leadingHidden
          ? "minmax(0, 1fr)"
          : `minmax(${leadingMinPx}px, ${leadFr}fr) 6px minmax(${trailingMinPx}px, ${trailFr}fr)`,
      }}
    >
      <div
        key="leading"
        className={cn(
          "min-h-0 min-w-0 flex flex-col overflow-hidden",
          leadingHidden && "hidden",
        )}
        aria-hidden={leadingHidden}
      >
        {leading}
      </div>
      <div
        key="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(trailingRatio * 100)}
        aria-hidden={leadingHidden}
        title="Sleep om te vergroten/verkleinen — dubbelklik voor standaard"
        onPointerDown={leadingHidden ? undefined : startDrag}
        onDoubleClick={leadingHidden ? undefined : resetSplit}
        className={cn(
          "cursor-col-resize bg-slate-800 hover:bg-amber-600/70 active:bg-amber-500/80 transition-colors touch-none",
          leadingHidden && "hidden",
        )}
      />
      <div key="trailing" className="min-h-0 min-w-0 flex flex-col overflow-hidden">
        {trailing}
      </div>
    </div>
  );
}
