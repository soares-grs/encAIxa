import { describe, expect, it } from "vitest";
import { parseClaudeStructuredOutput } from "./claude.js";
import { executeProvider, getProvider, requireReady } from "./index.js";
import { ProviderError, type AiProvider } from "./types.js";

describe("provedores de IA", () => {
  it("extrai a saída estruturada do envelope do Claude", () => {
    expect(
      parseClaudeStructuredOutput(
        JSON.stringify({ is_error: false, structured_output: { ok: true } }),
      ),
    ).toEqual({ ok: true });
  });
  it("rejeita saída inválida do Claude como falha externa", () => {
    expect(() => parseClaudeStructuredOutput("não é json")).toThrow(ProviderError);
  });
  it("rejeita identificadores desconhecidos", () => {
    expect(() => getProvider("gemini")).toThrow("Provedor de IA inválido.");
  });
  it("bloqueia um CLI ausente", async () => {
    const provider = {
      id: "claude",
      label: "Claude",
      status: async () => ({
        installed: false,
        authenticated: false,
        version: "",
        loginRunning: false,
        loginOutput: "",
      }),
    } as AiProvider;
    await expect(requireReady(provider)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("bloqueia um usuário desconectado", async () => {
    const provider = {
      id: "claude",
      label: "Claude",
      status: async () => ({
        installed: true,
        authenticated: false,
        version: "2",
        loginRunning: false,
        loginOutput: "",
      }),
    } as AiProvider;
    await expect(requireReady(provider)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("converte falhas inesperadas do CLI em gateway inválido", async () => {
    await expect(
      executeProvider(async () => {
        throw new Error("processo encerrou");
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
  it("preserva erros de timeout do provedor", async () => {
    await expect(
      executeProvider(async () => {
        throw new ProviderError("timeout", 504);
      }),
    ).rejects.toMatchObject({ statusCode: 504 });
  });
});
