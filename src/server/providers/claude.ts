import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  gapDraftSchema,
  optimizationSchema,
  profileDraftSchema,
  profileSchema,
  type Profile,
} from "../../shared/schemas.js";
import optimizationJsonSchema from "../../../schemas/optimization.schema.json" with { type: "json" };
import profileJsonSchema from "../../../schemas/profile.schema.json" with { type: "json" };
import gapDraftJsonSchema from "../../../schemas/gap-draft.schema.json" with { type: "json" };
import {
  gapFillPrompt,
  optimizationPrompt,
  profileExtractionPrompt,
  translationPrompt,
} from "./prompts.js";
import { ProviderError, type AiProvider, type ProviderActivityReporter } from "./types.js";

type ClaudeInvocation = { command: string; args: string[]; shell: boolean };

function processError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT")
    return new ProviderError(
      "Claude CLI não foi encontrado no PATH. Instale-o e reinicie o encAIxa.",
      502,
    );
  if (code === "EACCES") return new ProviderError("Sem permissão para executar o Claude CLI.", 502);
  return error;
}

export const quoteClaudeShellArgument = (arg: string) =>
  arg === "" || /[\s"{}[\]^&|<>()]/.test(arg) ? `"${arg.replace(/(\\*)"/g, '$1$1\\"')}"` : arg;

export function resolveClaudeInvocation(
  args: string[],
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (file: string) => boolean = existsSync,
): ClaudeInvocation {
  if (platform === "win32") {
    const npmRoot = path.join(env.APPDATA || "", "npm");
    const npmCli = path.join(npmRoot, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    const nativeCli = path.join(env.USERPROFILE || os.homedir(), ".local", "bin", "claude.exe");
    const npmCommand = path.join(npmRoot, "claude.cmd");
    if (fileExists(npmCli))
      return { command: process.execPath, args: [npmCli, ...args], shell: false };
    if (fileExists(nativeCli)) return { command: nativeCli, args, shell: false };
    if (fileExists(npmCommand))
      return { command: npmCommand, args: args.map(quoteClaudeShellArgument), shell: true };
    return {
      command: "claude",
      args: args.map(quoteClaudeShellArgument),
      shell: true,
    };
  }
  return { command: "claude", args, shell: false };
}

let loginOutput = "";
let loginRunning = false;

export function runClaude(
  args: string[],
  input = "",
  timeout = 15_000,
  cwd?: string,
  resolveInvocation: (args: string[]) => ClaudeInvocation = resolveClaudeInvocation,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const invocation = resolveInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      windowsHide: true,
      shell: invocation.shell,
      cwd,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new ProviderError("O Claude excedeu o tempo limite.", 504));
    }, timeout);
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(processError(error));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

export function parseClaudeStructuredOutput(value: string | object): unknown {
  try {
    const envelope: any = typeof value === "string" ? JSON.parse(value) : value;
    if (envelope.is_error || (envelope.subtype && envelope.subtype !== "success"))
      throw new Error(
        envelope.errors?.map((error: any) => error.message || String(error)).join("; ") ||
          envelope.result ||
          "O Claude retornou um erro.",
      );
    if (envelope.structured_output === undefined)
      throw new Error("O Claude não retornou uma resposta estruturada.");
    return envelope.structured_output;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error ? error.message : "O Claude retornou JSON inválido.",
      502,
    );
  }
}

export function createClaudeStreamParser(onEvent: (event: any) => void): {
  push(chunk: string): void;
  finish(): void;
} {
  let buffer = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    try {
      onEvent(JSON.parse(line));
    } catch {
      throw new ProviderError("O Claude retornou um evento de streaming inválido.", 502);
    }
  };
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
    },
    finish() {
      if (buffer.trim()) consume(buffer);
      buffer = "";
    },
  };
}

function runClaudeStream(
  args: string[],
  input: string,
  timeout: number,
  cwd: string,
  onEvent: (event: any) => void,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const invocation = resolveClaudeInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      windowsHide: true,
      shell: invocation.shell,
      cwd,
    });
    let stderr = "";
    const parser = createClaudeStreamParser(onEvent);
    const timer = setTimeout(() => {
      child.kill();
      reject(new ProviderError("O Claude excedeu o tempo limite.", 504));
    }, timeout);
    child.stdout.on("data", (data) => {
      try {
        parser.push(data.toString());
      } catch (error) {
        clearTimeout(timer);
        child.kill();
        reject(error);
      }
    });
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(processError(error));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        parser.finish();
        resolve({ code: code ?? 1, stderr });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input);
  });
}

async function structured(prompt: string, schema: object, report?: ProviderActivityReporter) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-claude-"));
  try {
    let resultEvent: any;
    let assistantEvents = 0;
    const response = await runClaudeStream(
      buildClaudeStructuredArgs(schema),
      prompt,
      180_000,
      temp,
      (event) => {
        if (event.type === "system" && event.subtype === "init") report?.("session_started");
        if (event.type === "assistant") {
          assistantEvents += 1;
          report?.(assistantEvents === 1 ? "response_in_progress" : "response_refined");
        }
        if (event.type === "result") {
          resultEvent = event;
          report?.("result_received");
        }
      },
    );
    if (response.code !== 0)
      throw new ProviderError(
        response.stderr.trim().replace(/^Error:\s*/i, "") ||
          "O Claude não conseguiu concluir a operação.",
        502,
      );
    if (!resultEvent) throw new ProviderError("O Claude terminou sem enviar um resultado.", 502);
    return parseClaudeStructuredOutput(resultEvent);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

const disallowedClaudeTools = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "NotebookEdit",
  "mcp__*",
].join(",");

export function buildClaudeStructuredArgs(schema: object) {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(schema),
    "--no-session-persistence",
    "--disallowedTools",
    disallowedClaudeTools,
    "--permission-mode",
    "plan",
  ];
}

export const claudeProvider: AiProvider = {
  id: "claude",
  label: "Claude",
  async status() {
    try {
      const version = await runClaude(["--version"]);
      if (version.code !== 0)
        throw new Error(version.stderr.trim() || "Claude CLI não encontrado.");
      const auth = await runClaude(["auth", "status"]);
      return {
        installed: true,
        authenticated: auth.code === 0,
        version: version.stdout.trim(),
        loginRunning,
        loginOutput,
      };
    } catch (error) {
      return {
        installed: false,
        authenticated: false,
        version: "",
        loginRunning,
        loginOutput,
        error: error instanceof Error ? error.message : "Claude CLI não encontrado.",
      };
    }
  },
  startLogin() {
    if (loginRunning) return;
    loginRunning = true;
    loginOutput = "Iniciando autenticação do Claude...\n";
    const invocation = resolveClaudeInvocation(["auth", "login"]);
    const child = spawn(invocation.command, invocation.args, {
      windowsHide: true,
      shell: invocation.shell,
    });
    child.stdout.on("data", (data) => (loginOutput += data.toString()));
    child.stderr.on("data", (data) => (loginOutput += data.toString()));
    child.on("error", (error) => {
      const normalized = processError(error);
      loginOutput += `\n${normalized instanceof Error ? normalized.message : String(normalized)}`;
      loginRunning = false;
    });
    child.on("close", (code) => {
      if (code) loginOutput += `\nLogin encerrado com código ${code}.`;
      loginRunning = false;
    });
  },
  async optimize(profile, job, report) {
    return optimizationSchema.parse(
      await structured(optimizationPrompt(profile, job), optimizationJsonSchema, report),
    );
  },
  async translateProfile(profile: Profile) {
    return profileSchema.parse(await structured(translationPrompt(profile), profileJsonSchema));
  },
  async extractProfile(resumeText: string, report?: ProviderActivityReporter) {
    return profileDraftSchema.parse(
      await structured(profileExtractionPrompt(resumeText), profileJsonSchema, report),
    );
  },
  async fillGap(input) {
    return gapDraftSchema.parse(await structured(gapFillPrompt(input), gapDraftJsonSchema));
  },
};
