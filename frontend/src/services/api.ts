import type {
  ChatMode,
  FeedbackAction,
  MessageDto,
  SessionDetail,
  SessionDto,
  SourceDto,
} from "../types/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function pasteSource(
  text: string,
  title?: string,
  options?: { isReference?: boolean; isDefault?: boolean },
): Promise<{ sourceId: string }> {
  return request("/api/sources/paste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      title,
      isReference: options?.isReference ?? false,
      isDefault: options?.isDefault ?? false,
    }),
  });
}

export async function uploadSource(
  file: File,
  options?: { isReference?: boolean; isDefault?: boolean },
): Promise<{ sourceId: string }> {
  const form = new FormData();
  form.append("file", file);
  const params = new URLSearchParams();
  if (options?.isReference) params.set("is_reference", "true");
  if (options?.isDefault) params.set("is_default", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/sources/upload${query}`, { method: "POST", body: form });
}

export async function createWebSource(
  url: string,
  mode: "page" | "site",
  title?: string,
  options?: { isReference?: boolean; isDefault?: boolean },
): Promise<{ sourceId: string }> {
  return request("/api/sources/web", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      mode,
      title,
      isReference: options?.isReference ?? false,
      isDefault: options?.isDefault ?? false,
    }),
  });
}

export async function refreshWebSource(
  sourceId: string,
  force = false,
): Promise<{ sourceId: string; status: string; outcome: string }> {
  const q = force ? "?force=true" : "";
  return request(`/api/sources/${sourceId}/refresh${q}`, { method: "POST" });
}

export async function getSourceStatus(sourceId: string) {
  return request<{ status: string; error?: string }>(`/api/sources/${sourceId}/status`);
}

export async function getSource(sourceId: string): Promise<SourceDto> {
  const data = await request<SourceDto>(`/api/sources/${sourceId}`);
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    status: data.status,
    error: data.error,
    isReference: data.isReference ?? false,
    isDefault: data.isDefault ?? false,
    student: data.student,
    subject: data.subject,
    originUrl: data.originUrl ?? null,
    webMode: data.webMode ?? null,
    pageCount: data.pageCount ?? null,
    lastCheckedAt: data.lastCheckedAt ?? null,
    lastRefreshedAt: data.lastRefreshedAt ?? null,
  };
}

export async function updateSource(
  sourceId: string,
  patch: { isReference?: boolean; isDefault?: boolean; name?: string },
): Promise<SourceDto> {
  return request<SourceDto>(`/api/sources/${sourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteSource(sourceId: string): Promise<void> {
  await request(`/api/sources/${sourceId}`, { method: "DELETE" });
}

export async function listSources(): Promise<SourceDto[]> {
  const data = await request<{ sources: SourceDto[] }>("/api/sources");
  return data.sources;
}

export async function createSession(title: string, preferredModel?: string) {
  return request<SessionDetail>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, preferredModel }),
  });
}

export async function updateSession(
  sessionId: string,
  patch: { title?: string; student?: string | null; subject?: string | null },
) {
  return request<SessionDetail>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function attachSource(sessionId: string, sourceId: string) {
  return request(`/api/sessions/${sessionId}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });
}

export async function listSessions(): Promise<SessionDto[]> {
  const data = await request<{ sessions: SessionDto[] }>("/api/sessions");
  return data.sessions.map((session) => ({
    ...session,
    conversations: session.conversations ?? [],
  }));
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const data = await request<SessionDetail>(`/api/sessions/${sessionId}`);
  return {
    ...data,
    memory: data.memory ?? "",
    feedbackDraft: data.feedbackDraft ?? "",
    conversations: data.conversations ?? [],
    sources: data.sources ?? [],
  };
}

export async function detachSource(sessionId: string, sourceId: string) {
  return request(`/api/sessions/${sessionId}/sources/${sourceId}`, { method: "DELETE" });
}

export async function createConversation(sessionId: string, title?: string) {
  return request<{ id: string; title: string; sourceIds: string[]; feedbackDraft?: string }>(
    `/api/sessions/${sessionId}/conversations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
}

export async function renameConversation(sessionId: string, conversationId: string, title: string) {
  return request(`/api/sessions/${sessionId}/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(sessionId: string, conversationId: string) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
}

export async function setConversationSources(
  sessionId: string,
  conversationId: string,
  sourceIds: string[],
) {
  return request<{ sourceIds: string[] }>(
    `/api/sessions/${sessionId}/conversations/${conversationId}/sources`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds }),
    },
  );
}

export async function saveMemory(sessionId: string, content: string) {
  return request<{ content: string }>(`/api/sessions/${sessionId}/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function appendMemory(sessionId: string, content: string) {
  return request<{ content: string }>(`/api/sessions/${sessionId}/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function saveFeedbackDraft(
  sessionId: string,
  conversationId: string,
  content: string,
) {
  return request<{ content: string }>(
    `/api/sessions/${sessionId}/conversations/${conversationId}/feedback`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
}

function consumeSseEvents(
  raw: string,
  onEvent: (type: string, data: unknown) => void,
): { rest: string; finished: boolean } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() || "";
  for (const part of parts) {
    const lines = part.split("\n");
    let eventType = "message";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine = line.slice(5).trim();
    }
    if (!dataLine) continue;
    try {
      onEvent(eventType, JSON.parse(dataLine));
    } catch {
      // Ignore malformed SSE payload line so the stream can still terminate cleanly
    }
    if (eventType === "done" || eventType === "error") {
      return { rest: "", finished: true };
    }
  }
  return { rest, finished: false };
}

async function readSseStream(
  res: Response,
  onEvent: (type: string, data: unknown) => void,
) {
  if (!res.ok || !res.body) {
    throw new Error(await res.text());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          const step = consumeSseEvents(`${buffer}\n\n`, onEvent);
          finished = step.finished;
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const step = consumeSseEvents(buffer, onEvent);
      buffer = step.rest;
      if (step.finished) {
        finished = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!finished) {
    throw new Error(
      "Verbinding verbroken tijdens genereren. Probeer het opnieuw; bij herhaling check de proxy-timeout of Ollama.",
    );
  }
}

export async function streamFeedback(
  sessionId: string,
  payload: {
    action: FeedbackAction;
    draft: string;
    instructions?: string;
    model: string;
    conversationId?: string | null;
    selection?: string;
    sourceIds?: string[];
  },
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
) {
  const path = payload.conversationId
    ? `/api/sessions/${sessionId}/conversations/${payload.conversationId}/feedback/generate`
    : `/api/sessions/${sessionId}/feedback/generate`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  await readSseStream(res, onEvent);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await res.text() || res.statusText);
  }
  const text = await res.text();
  if (text && res.headers.get("content-type")?.includes("json")) {
    JSON.parse(text);
  }
}

export async function getMessages(sessionId: string, conversationId: string): Promise<MessageDto[]> {
  const data = await request<{ messages: MessageDto[] }>(
    `/api/sessions/${sessionId}/conversations/${conversationId}/messages`,
  );
  return data.messages;
}

export async function truncateMessagesFrom(
  sessionId: string,
  conversationId: string,
  messageId: string,
): Promise<MessageDto[]> {
  const data = await request<{ messages: MessageDto[] }>(
    `/api/sessions/${sessionId}/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
  return data.messages;
}

export async function listModels(): Promise<string[]> {
  const data = await request<{ models: { name: string }[] }>("/api/models");
  return data.models.map((m) => m.name);
}

export function sourceContentUrl(sourceId: string) {
  return `${API_BASE}/api/sources/${sourceId}/content`;
}

export function sourcePreviewUrl(sourceId: string) {
  return `${API_BASE}/api/sources/${sourceId}/preview`;
}

export async function streamChat(
  sessionId: string,
  conversationId: string,
  payload: { message: string; mode: ChatMode; model: string; selection?: string; chunkId?: string },
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  await readSseStream(res, onEvent);
}
