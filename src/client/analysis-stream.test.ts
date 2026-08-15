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
    const payload = `${JSON.stringify(progress)}\n${JSON.stringify({ type: "complete", data })}\n`;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([payload.slice(0, 23), payload.slice(23, 71), payload.slice(71)]),
        ),
    );
    const onProgress = vi.fn();

    await expect(streamAnalysis("job-1", "codex", onProgress)).resolves.toEqual(data);
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(progress);
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
