export type ChatMode = "explore" | "investigate" | "spar";

export interface CitationDto {
  chunkId: string;
  sourceId: string | null;
  pageNo: number | null;
  sectionTitle: string | null;
  excerpt: string;
  bbox: { l: number; t: number; r: number; b: number } | null;
  anchorId?: string | null;
}

export interface MessageDto {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: ChatMode | null;
  contextStrategy?: string | null;
  createdAt: string;
  citations: CitationDto[];
}

export interface SessionDto {
  id: string;
  title: string;
  preferredModel?: string | null;
  updatedAt?: string | null;
}

export interface SourceDto {
  id: string;
  name: string;
  type: "pdf" | "docx" | "text";
  status: "queued" | "processing" | "ready" | "failed";
  error?: string | null;
}
