import type { ChatMode, MessageDto, SessionDto, SourceDto } from "../types/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function pasteSource(text: string, title?: string): Promise<{ sourceId: string }> {
  return request("/api/sources/paste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, title }),
  });
}

export async function uploadSource(file: File): Promise<{ sourceId: string }> {
  const form = new FormData();
  form.append("file", file);
  return request("/api/sources/upload", { method: "POST", body: form });
}

export async function getSourceStatus(sourceId: string) {
  return request<{ status: string; error?: string }>(`/api/sources/${sourceId}/status`);
}

export async function getSource(sourceId: string): Promise<SourceDto> {
  const data = await request<{
    id: string;
    name: string;
    type: string;
    status: string;
    error?: string;
  }>(`/api/sources/${sourceId}`);
  return {
    id: data.id,
    name: data.name,
    type: data.type as SourceDto["type"],
    status: data.status as SourceDto["status"],
    error: data.error,
  };
}

export async function createSession(title: string, preferredModel?: string) {
  return request<{ id: string }>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, preferredModel }),
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
  return data.sessions;
}

export async function getSession(sessionId: string) {
  return request<{ id: string; title: string; sourceIds: string[]; preferredModel?: string }>(
    `/api/sessions/${sessionId}`,
  );
}

export async function getMessages(sessionId: string): Promise<MessageDto[]> {
  const data = await request<{ messages: MessageDto[] }>(`/api/sessions/${sessionId}/messages`);
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
  payload: { message: string; mode: ChatMode; model: string; selection?: string; chunkId?: string },
  onEvent: (type: string, data: unknown) => void,
) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    throw new Error(await res.text());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let eventType = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (dataLine) {
        onEvent(eventType, JSON.parse(dataLine));
      }
    }
  }
}
