import { describe, expect, it } from "vitest";
import {
  createClaudeStreamParser,
  parseClaudeStructuredOutput,
  resolveClaudeInvocation,
} from "./claude.js";
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
  it("executa a instalação npm do Claude sem shell no Windows", () => {
    const invocation = resolveClaudeInvocation(
      ["--json-schema", '{"type":"object","properties":{"name":{"type":"string"}}}'],
      "win32",
      { APPDATA: "C:\\Users\\Ana\\AppData\\Roaming" },
      () => true,
    );
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args.at(-1)).toBe(
      '{"type":"object","properties":{"name":{"type":"string"}}}',
    );
    expect(invocation.args[0]).toContain("@anthropic-ai");
  });
  it("usa o binário nativo diretamente fora da instalação npm", () => {
    expect(resolveClaudeInvocation(["--version"], "linux", {}, () => false)).toEqual({
      command: "claude",
      args: ["--version"],
    });
  });
  it("mantém eventos stream-json íntegros entre chunks", () => {
    const events: unknown[] = [];
    const parser = createClaudeStreamParser((event) => events.push(event));
    parser.push('{"type":"system","subtype":"in');
    parser.push('it"}\n{"type":"result","subtype":"success",');
    parser.push('"structured_output":{"ok":true}}\n');
    parser.finish();
    expect(events).toEqual([
      { type: "system", subtype: "init" },
      { type: "result", subtype: "success", structured_output: { ok: true } },
    ]);
    expect(parseClaudeStructuredOutput(events[1] as object)).toEqual({ ok: true });
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
