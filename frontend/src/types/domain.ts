export type ChatMode = "explore" | "investigate" | "spar";
export type FeedbackAction = "compose" | "expand" | "rewrite";

export interface CitationDto {
  chunkId: string;
  sourceId: string | null;
  documentName?: string | null;
  pageNo: number | null;
  sectionTitle: string | null;
  excerpt: string;
  bbox: { l: number; t: number; r: number; b: number } | null;
  anchorId?: string | null;
  promptIndex?: number | null;
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

export interface ConversationDto {
  id: string;
  title: string;
  updatedAt?: string | null;
  sourceIds: string[];
}

export interface SessionDto {
  id: string;
  title: string;
  preferredModel?: string | null;
  updatedAt?: string | null;
  student?: string | null;
  subject?: string | null;
  conversations: ConversationDto[];
}

export interface SessionDetail extends SessionDto {
  memory: string;
  feedbackDraft: string;
  sources: SourceDto[];
}

export interface SourceDto {
  id: string;
  name: string;
  type: "pdf" | "docx" | "text";
  status: "queued" | "processing" | "ready" | "failed";
  error?: string | null;
  isReference?: boolean;
  isDefault?: boolean;
  student?: string | null;
  subject?: string | null;
}
