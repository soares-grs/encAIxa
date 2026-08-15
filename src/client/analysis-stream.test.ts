import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisStreamError, streamAnalysis } from "./analysis-stream";

const encoder = new TextEncoder();

function streamResponse(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("streamAnalysis", () => {
  it("processa eventos NDJSON mesmo quando chegam divididos em chunks", async () => {
    const data = { analysis: { summary: "Resultado" }, score: 87 };
    const progress = {
      type: "progress",
      stage: "analyzing",
      progress: 36,
      title: "Analisando seu encaixe",
      message: "Comparando perfil e vaga.",
    };
    const activity = {
      type: "activity",
      stage: "analyzing",
      message: "Claude está estruturando a análise.",
      timestamp: "2026-08-15T12:00:00.000Z",
    };
    const heartbeat = {
      type: "heartbeat",
      stage: "analyzing",
      timestamp: "2026-08-15T12:00:04.000Z",
      elapsedMs: 4_000,
    };
    const payload = `${JSON.stringify(progress)}\n${JSON.stringify(activity)}\n${JSON.stringify(heartbeat)}\n${JSON.stringify({ type: "complete", data })}\n`;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([payload.slice(0, 23), payload.slice(23, 71), payload.slice(71)]),
        ),
    );
    const onEvent = vi.fn();

    await expect(streamAnalysis("job-1", "codex", onEvent)).resolves.toEqual(data);
    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenNthCalledWith(1, progress);
    expect(onEvent).toHaveBeenNthCalledWith(2, activity);
    expect(onEvent).toHaveBeenNthCalledWith(3, heartbeat);
  });

  it("propaga o erro enviado durante a análise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          `${JSON.stringify({
            type: "error",
            stage: "checking_provider",
            message: "Claude não está autenticado.",
            statusCode: 401,
          })}\n`,
        ]),
      ),
    );

    await expect(streamAnalysis("job-1", "claude", vi.fn())).rejects.toEqual(
      new AnalysisStreamError("Claude não está autenticado.", 401),
    );
  });
});
