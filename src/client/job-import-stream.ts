import type { JobImportCompleteEvent, JobImportStreamEvent } from "../shared/schemas";
import { AnalysisStreamError } from "./analysis-stream";

export async function streamJobImport(
  url: string,
  provider: "codex" | "claude",
  onEvent: (
    event: Exclude<JobImportStreamEvent, JobImportCompleteEvent | { type: "error" }>,
  ) => void,
): Promise<JobImportCompleteEvent["data"]> {
  const response = await fetch("/api/jobs/extract/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, provider }),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new AnalysisStreamError(
      data.error || "Não foi possível iniciar a captura da vaga.",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: JobImportCompleteEvent["data"] | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: JobImportStreamEvent;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AnalysisStreamError("O servidor enviou um evento de captura inválido.", 502);
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
  if (!completed) throw new AnalysisStreamError("A captura terminou sem dados da vaga.", 502);
  return completed;
}
