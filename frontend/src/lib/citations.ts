import type { CitationDto } from "../types/domain";

const GENERIC_SECTION_TITLES = new Set(["Inhoud", "Content", ""]);
const MISSING_ORDER = Number.MAX_SAFE_INTEGER;

function documentOrderKey(c: CitationDto): [number, number, string] {
  return [
    c.pageNo ?? MISSING_ORDER,
    c.promptIndex ?? MISSING_ORDER,
    c.chunkId,
  ];
}

export function sortCitations(citations: CitationDto[]): CitationDto[] {
  return [...citations].sort((a, b) => {
    const ka = documentOrderKey(a);
    const kb = documentOrderKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2].localeCompare(kb[2]);
  });
}

function truncate(text: string, maxLen: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1)}…`;
}

/** Short label for citation chips; full excerpt goes in title/tooltip. */
function documentPrefix(c: CitationDto): string | null {
  if (!c.documentName) return null;
  const base = c.documentName.replace(/\.[^.]+$/, "");
  return truncate(base, 18) || null;
}

export function formatCitationLabel(c: CitationDto): string {
  const snippet = truncate(c.excerpt, 28);
  const doc = documentPrefix(c);
  let place = "";
  if (c.pageNo != null) place = `p. ${c.pageNo}`;
  else if (c.promptIndex != null) place = `Passage ${c.promptIndex}`;
  else if (c.sectionTitle && !GENERIC_SECTION_TITLES.has(c.sectionTitle)) place = c.sectionTitle;

  const parts = [doc, place, snippet].filter(Boolean);
  return parts.join(" · ") || "Bronverwijzing";
}

export function citationTooltip(c: CitationDto): string {
  const parts: string[] = [];
  if (c.documentName) parts.push(c.documentName);
  if (c.pageNo != null) parts.push(`Pagina ${c.pageNo}`);
  if (c.promptIndex != null) parts.push(`Passage ${c.promptIndex}`);
  if (c.sectionTitle && !GENERIC_SECTION_TITLES.has(c.sectionTitle)) {
    parts.push(c.sectionTitle);
  }
  parts.push(c.excerpt);
  return parts.join(" — ");
}
