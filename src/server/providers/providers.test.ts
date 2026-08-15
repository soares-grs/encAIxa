import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveCodexInvocation, runCodex } from "../codex.js";
import {
  buildClaudeStructuredArgs,
  createClaudeStreamParser,
  parseClaudeStructuredOutput,
  quoteClaudeShellArgument,
  resolveClaudeInvocation,
  runClaude,
} from "./claude.js";
import { executeProvider, getProvider, requireReady } from "./index.js";
import { ProviderError, type AiProvider } from "./types.js";

describe("provedores de IA", () => {
  it("usa apenas flags documentadas na execução estruturada do Claude", () => {
    const args = buildClaudeStructuredArgs({ type: "object" });
    expect(args).not.toContain("--safe-mode");
    expect(args).not.toContain("--tools");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("--disallowedTools");
  });
  it("preserva argumentos e stdin ao executar CLIs sem shell", async () => {
    const fixture = path.resolve("src/server/providers/fixtures/fake-cli.mjs");
    const invocation = (args: string[]) => ({
      command: process.execPath,
      args: [fixture, ...args],
      shell: false,
    });
    const [codex, claude] = await Promise.all([
      runCodex(["exec", "valor com espaço"], "entrada codex", 5_000, invocation),
      runClaude(["-p", "valor com espaço"], "entrada claude", 5_000, undefined, invocation),
    ]);
    expect(JSON.parse(codex.stdout)).toEqual({
      args: ["exec", "valor com espaço"],
      input: "entrada codex",
    });
    expect(JSON.parse(claude.stdout)).toEqual({
      args: ["-p", "valor com espaço"],
      input: "entrada claude",
    });
  });
  it("executa o Codex diretamente no Linux sem shell", () => {
    expect(resolveCodexInvocation(["--version"], "linux", {}, () => false)).toEqual({
      command: "codex",
      args: ["--version"],
      shell: false,
    });
  });
  it("usa o shim npm do Codex somente no Windows", () => {
    const invocation = resolveCodexInvocation(
      ["login", "status"],
      "win32",
      { APPDATA: "C:\\npm" },
      (file) => file.endsWith("codex.cmd"),
    );
    expect(invocation).toEqual({
      command: path.join("C:\\npm", "npm", "codex.cmd"),
      args: ["login", "status"],
      shell: true,
    });
  });
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
    expect(invocation.shell).toBe(false);
    expect(invocation.args.at(-1)).toBe(
      '{"type":"object","properties":{"name":{"type":"string"}}}',
    );
    expect(invocation.args[0]).toContain("@anthropic-ai");
  });
  it("usa o binário nativo diretamente fora da instalação npm", () => {
    expect(resolveClaudeInvocation(["--version"], "linux", {}, () => false)).toEqual({
      command: "claude",
      args: ["--version"],
      shell: false,
    });
  });
  it("detecta o instalador nativo do Claude no Windows", () => {
    const invocation = resolveClaudeInvocation(
      ["--version"],
      "win32",
      { APPDATA: "C:\\npm", USERPROFILE: "C:\\Users\\Ana" },
      (file) => file.endsWith("claude.exe"),
    );
    expect(invocation).toEqual({
      command: path.join("C:\\Users\\Ana", ".local", "bin", "claude.exe"),
      args: ["--version"],
      shell: false,
    });
  });
  it("protege JSON e argumentos vazios ao usar o shim .cmd", () => {
    const schema = '{"type":"object","required":["name"]}';
    const invocation = resolveClaudeInvocation(
      ["--json-schema", schema, "--tools", ""],
      "win32",
      { APPDATA: "C:\\npm", USERPROFILE: "C:\\Users\\Ana" },
      (file) => file.endsWith("claude.cmd"),
    );
    expect(invocation.command).toMatch(/claude\.cmd$/);
    expect(invocation.shell).toBe(true);
    expect(invocation.args[1]).toBe(quoteClaudeShellArgument(schema));
    expect(invocation.args[3]).toBe('""');
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
