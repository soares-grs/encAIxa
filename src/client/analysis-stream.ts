import type {
  AnalysisCompleteEvent,
  AnalysisProgressEvent,
  AnalysisStreamEvent,
} from "../shared/schemas";

export class AnalysisStreamError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
  ) {
    super(message);
  }
}

export async function streamAnalysis(
  jobId: string,
  provider: "codex" | "claude",
  onProgress: (event: AnalysisProgressEvent) => void,
): Promise<AnalysisCompleteEvent["data"]> {
  const response = await fetch(`/api/jobs/${jobId}/analyze/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new AnalysisStreamError(
      data.error || "Não foi possível iniciar a análise.",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: AnalysisCompleteEvent["data"] | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: AnalysisStreamEvent;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AnalysisStreamError("O servidor enviou um evento de análise inválido.", 502);
    }
    if (event.type === "progress") onProgress(event);
    if (event.type === "error") throw new AnalysisStreamError(event.message, event.statusCode);
    if (event.type === "complete") completed = event.data;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!completed) throw new AnalysisStreamError("A análise terminou sem um resultado.", 502);
  return completed;
}
