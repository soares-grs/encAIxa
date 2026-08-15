import { afterEach, describe, expect, it, vi } from "vitest";
import { streamJobImport } from "./job-import-stream";

afterEach(() => vi.unstubAllGlobals());

describe("streamJobImport", () => {
  it("consome progresso e retorna os dados extraídos", async () => {
    const events = [
      {
        type: "progress",
        stage: "loading_page",
        progress: 30,
        title: "Abrindo",
        message: "Página",
      },
      {
        type: "complete",
        data: {
          sourceUrl: "https://example.com/vaga",
          provider: "codex",
          company: "Acme",
          role: "Dev",
          text: "Descrição completa da oportunidade",
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
            headers: { "Content-Type": "application/x-ndjson" },
          }),
      ),
    );
    const onEvent = vi.fn();
    await expect(
      streamJobImport("https://example.com/vaga", "codex", onEvent),
    ).resolves.toMatchObject({
      company: "Acme",
      role: "Dev",
    });
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("propaga erros enviados no stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              stage: "loading_page",
              message: "Página bloqueada",
              statusCode: 502,
            }) + "\n",
          ),
      ),
    );
    await expect(streamJobImport("https://example.com", "claude", vi.fn())).rejects.toThrow(
      "Página bloqueada",
    );
  });
});
