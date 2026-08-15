import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  gapDraftSchema,
  optimizationSchema,
  profileDraftSchema,
  type Profile,
} from "../shared/schemas.js";
import { ProviderError, type ProviderActivityReporter } from "./providers/types.js";
import {
  optimizationPrompt,
  gapFillPrompt,
  profileExtractionPrompt,
  translationPrompt,
} from "./providers/prompts.js";

type CodexInvocation = { command: string; args: string[]; shell: boolean };

export function resolveCodexInvocation(
  args: string[],
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (file: string) => boolean = existsSync,
): CodexInvocation {
  if (platform !== "win32") return { command: "codex", args, shell: false };
  const npmCommand = path.join(env.APPDATA || "", "npm", "codex.cmd");
  return {
    command: fileExists(npmCommand) ? npmCommand : "codex.cmd",
    args,
    shell: true,
  };
}

function processError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT")
    return new ProviderError(
      "Codex CLI não foi encontrado no PATH. Instale-o e reinicie o encAIxa.",
      502,
    );
  if (code === "EACCES") return new ProviderError("Sem permissão para executar o Codex CLI.", 502);
  return error;
}
let loginOutput = "";
let loginRunning = false;
export function runCodex(
  args: string[],
  input = "",
  timeout = 15_000,
  resolveInvocation: (args: string[]) => CodexInvocation = resolveCodexInvocation,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const invocation = resolveInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      windowsHide: true,
      shell: invocation.shell,
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new ProviderError("O Codex excedeu o tempo limite.", 504));
    }, timeout);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(processError(e));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}
export async function codexStatus() {
  try {
    const version = await runCodex(["--version"]);
    const status = await runCodex(["login", "status"]);
    return {
      installed: true,
      authenticated: status.code === 0,
      version: version.stdout.trim(),
      loginRunning,
      loginOutput,
    };
  } catch {
    return { installed: false, authenticated: false, version: "", loginRunning, loginOutput };
  }
}
export function startLogin() {
  if (loginRunning) return;
  loginRunning = true;
  loginOutput = "Iniciando autenticação...\n";
  const invocation = resolveCodexInvocation(["login", "--device-auth"]);
  const child = spawn(invocation.command, invocation.args, {
    windowsHide: true,
    shell: invocation.shell,
  });
  child.stdout.on("data", (d) => (loginOutput += d.toString()));
  child.stderr.on("data", (d) => (loginOutput += d.toString()));
  child.on("error", (e) => {
    const error = processError(e);
    loginOutput += `\n${error instanceof Error ? error.message : String(error)}`;
    loginRunning = false;
  });
  child.on("close", () => (loginRunning = false));
}
export async function optimize(
  profile: Profile,
  job: { company: string; role: string; text: string },
  report?: ProviderActivityReporter,
) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-codex-"));
  const resultPath = path.join(temp, "result.json");
  const schemaPath = path.resolve("schemas", "optimization.schema.json");
  const prompt = optimizationPrompt(profile, job);
  try {
    const args = [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-C",
      temp,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      resultPath,
      "-",
    ];
    report?.("session_started");
    report?.("response_in_progress");
    const response = await runCodex(args, prompt, 180_000);
    if (response.code !== 0)
      throw new Error(response.stderr.trim() || "O Codex não conseguiu concluir a análise.");
    report?.("result_received");
    return optimizationSchema.parse(JSON.parse(await fs.readFile(resultPath, "utf8")));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function translateProfile(profile: Profile) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-translate-"));
  const resultPath = path.join(temp, "result.json");
  const prompt = translationPrompt(profile);
  try {
    const response = await runCodex(
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-C",
        temp,
        "--output-schema",
        path.resolve("schemas", "profile.schema.json"),
        "--output-last-message",
        resultPath,
        "-",
      ],
      prompt,
      180_000,
    );
    if (response.code !== 0)
      throw new Error(response.stderr.trim() || "Não foi possível traduzir o currículo.");
    return (await import("../shared/schemas.js")).profileSchema.parse(
      JSON.parse(await fs.readFile(resultPath, "utf8")),
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function extractProfile(resumeText: string) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-profile-import-"));
  const resultPath = path.join(temp, "result.json");
  try {
    const response = await runCodex(
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-C",
        temp,
        "--output-schema",
        path.resolve("schemas", "profile.schema.json"),
        "--output-last-message",
        resultPath,
        "-",
      ],
      profileExtractionPrompt(resumeText),
      180_000,
    );
    if (response.code !== 0)
      throw new Error(response.stderr.trim() || "Não foi possível importar o currículo.");
    return profileDraftSchema.parse(JSON.parse(await fs.readFile(resultPath, "utf8")));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function fillGap(input: Parameters<typeof gapFillPrompt>[0]) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-gap-"));
  const resultPath = path.join(temp, "result.json");
  try {
    const response = await runCodex(
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-C",
        temp,
        "--output-schema",
        path.resolve("schemas", "gap-draft.schema.json"),
        "--output-last-message",
        resultPath,
        "-",
      ],
      gapFillPrompt(input),
      180_000,
    );
    if (response.code !== 0)
      throw new Error(response.stderr.trim() || "Não foi possível preencher a lacuna.");
    return gapDraftSchema.parse(JSON.parse(await fs.readFile(resultPath, "utf8")));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
