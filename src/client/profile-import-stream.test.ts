import { afterEach, describe, expect, it, vi } from "vitest";
import { streamProfileImport } from "./profile-import-stream";

afterEach(() => vi.unstubAllGlobals());

describe("streamProfileImport", () => {
  it("processa eventos divididos entre chunks e retorna o perfil", async () => {
    const profile = {
      name: "Ana",
      title: "Dev",
      subtitle: "",
      contact: { email: "", phone: "", linkedin: "", github: "", location: "" },
      summary: "Resumo",
      skills: [],
      experience: [],
      education: [],
      languages: [],
    };
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('{"type":"progress","stage":"extr'));
                controller.enqueue(
                  encoder.encode(
                    `acting","progress":38,"title":"Extraindo","message":"Aguarde"}\n${JSON.stringify({ type: "complete", data: { profile, provider: "claude" } })}\n`,
                  ),
                );
                controller.close();
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const onEvent = vi.fn();
    await expect(
      streamProfileImport(new File(["cv"], "cv.txt"), "claude", onEvent),
    ).resolves.toEqual({ profile, provider: "claude" });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ stage: "extracting" }));
  });
});
