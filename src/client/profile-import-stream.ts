import type { ImportCompleteEvent, ImportStreamEvent } from "../shared/schemas";
import { AnalysisStreamError } from "./analysis-stream";

export async function streamProfileImport(
  file: File,
  provider: "codex" | "claude",
  onEvent: (event: Exclude<ImportStreamEvent, ImportCompleteEvent | { type: "error" }>) => void,
): Promise<ImportCompleteEvent["data"]> {
  const body = new FormData();
  body.append("file", file);
  body.append("provider", provider);
  const response = await fetch("/api/onboarding/import/stream", { method: "POST", body });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new AnalysisStreamError(
      data.error || "Não foi possível iniciar a importação.",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: ImportCompleteEvent["data"] | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: ImportStreamEvent;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AnalysisStreamError("O servidor enviou um evento de importação inválido.", 502);
    }
    if (event.type === "progress" || event.type === "activity" || event.type === "heartbeat")
      onEvent(event);
    if (event.type === "error") throw new AnalysisStreamError(event.message, event.statusCode);
    if (event.type === "complete") completed = event.data;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!completed) throw new AnalysisStreamError("A importação terminou sem um perfil.", 502);
  return completed;
}
