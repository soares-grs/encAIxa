import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { optimizationSchema, profileSchema, type Profile } from "../../shared/schemas.js";
import optimizationJsonSchema from "../../../schemas/optimization.schema.json" with { type: "json" };
import profileJsonSchema from "../../../schemas/profile.schema.json" with { type: "json" };
import { optimizationPrompt, translationPrompt } from "./prompts.js";
import { ProviderError, type AiProvider } from "./types.js";

const windowsClaude = path.join(process.env.APPDATA || "", "npm", "claude.cmd");
const command =
  process.platform === "win32" && existsSync(windowsClaude)
    ? windowsClaude
    : process.platform === "win32"
      ? "claude.cmd"
      : "claude";
let loginOutput = "";
let loginRunning = false;

export function runClaude(
  args: string[],
  input = "",
  timeout = 15_000,
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: process.platform === "win32",
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
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

export function parseClaudeStructuredOutput(value: string): unknown {
  try {
    const envelope = JSON.parse(value);
    if (envelope.is_error) throw new Error(envelope.result || "O Claude retornou um erro.");
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

async function structured(prompt: string, schema: object) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-claude-"));
  try {
    const response = await runClaude(
      [
        "-p",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(schema),
        "--no-session-persistence",
        "--safe-mode",
        "--tools",
        "",
        "--disallowedTools",
        "mcp__*",
        "--permission-mode",
        "plan",
      ],
      prompt,
      180_000,
      temp,
    );
    if (response.code !== 0)
      throw new ProviderError(
        response.stderr.trim() || "O Claude não conseguiu concluir a operação.",
        502,
      );
    return parseClaudeStructuredOutput(response.stdout);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

export const claudeProvider: AiProvider = {
  id: "claude",
  label: "Claude",
  async status() {
    try {
      const version = await runClaude(["--version"]);
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
    const child = spawn(command, ["auth", "login"], {
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.stdout.on("data", (data) => (loginOutput += data.toString()));
    child.stderr.on("data", (data) => (loginOutput += data.toString()));
    child.on("error", (error) => {
      loginOutput += `\n${error.message}`;
      loginRunning = false;
    });
    child.on("close", (code) => {
      if (code) loginOutput += `\nLogin encerrado com código ${code}.`;
      loginRunning = false;
    });
  },
  async optimize(profile, job) {
    return optimizationSchema.parse(
      await structured(optimizationPrompt(profile, job), optimizationJsonSchema),
    );
  },
  async translateProfile(profile: Profile) {
    return profileSchema.parse(await structured(translationPrompt(profile), profileJsonSchema));
  },
};
