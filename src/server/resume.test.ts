// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyDecisions, generatePdf, resolvePdfBrowserExecutable } from "./resume.js";
import type { Optimization, Profile } from "../shared/schemas.js";
const profile: Profile = {
  name: "Gabriel",
  title: "Engenheiro",
  subtitle: "",
  contact: { email: "", phone: "", linkedin: "", github: "", location: "" },
  summary: "Original",
  skills: ["Java"],
  experience: [{ title: "Dev", company: "X", period: "2024", bullets: ["Bullet original"] }],
  education: [],
  languages: [],
};
const analysis: Optimization = {
  role: "Dev",
  company: "X",
  requirements: [],
  relevantSkills: [],
  gaps: [],
  suggestions: [
    {
      id: "s1",
      type: "summary",
      target: "summary",
      original: "Original",
      proposed: "Novo",
      reason: "Aderência",
      evidenceRefs: ["summary"],
    },
    {
      id: "s2",
      type: "bullet",
      target: "experience.0.bullets.0",
      original: "Bullet original",
      proposed: "Bullet novo",
      reason: "Clareza",
      evidenceRefs: ["experience.0.bullets.0"],
    },
    {
      id: "s3",
      type: "bullet",
      target: "experience.0.bullets.append",
      original: "",
      proposed: "Automatizou entregas com CI/CD.",
      reason: "Preenche a lacuna.",
      evidenceRefs: ["Contexto informado pelo usuário"],
    },
  ],
};
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});
describe("applyDecisions", () => {
  it("aplica apenas sugestões aceitas sem alterar o perfil-base", () => {
    const result = applyDecisions(profile, analysis, [
      { suggestionId: "s1", accepted: true },
      { suggestionId: "s2", accepted: false },
      { suggestionId: "s3", accepted: true },
    ]);
    expect(result.summary).toBe("Novo");
    expect(result.experience[0].bullets[0]).toBe("Bullet original");
    expect(result.experience[0].bullets[1]).toBe("Automatizou entregas com CI/CD.");
    expect(profile.experience[0].bullets).toHaveLength(1);
    expect(profile.summary).toBe("Original");
  });
  it("prioriza o Chromium gerenciado antes dos navegadores do sistema", async () => {
    await expect(
      resolvePdfBrowserExecutable(
        "linux",
        {},
        (file) => file === "/cache/chrome",
        () => "/cache/chrome",
      ),
    ).resolves.toBe("/cache/chrome");
  });
  it("encontra Chromium instalado no Linux quando o gerenciado não existe", async () => {
    await expect(
      resolvePdfBrowserExecutable(
        "linux",
        {},
        (file) => file === "/usr/bin/brave-browser",
        () => "/cache/missing",
      ),
    ).resolves.toBe("/usr/bin/brave-browser");
  });
  it("rejeita um caminho de navegador configurado que não existe", async () => {
    await expect(
      resolvePdfBrowserExecutable(
        "linux",
        { PUPPETEER_EXECUTABLE_PATH: "/missing/chrome" },
        () => false,
      ),
    ).rejects.toThrow("PUPPETEER_EXECUTABLE_PATH");
  });
  it("gera um PDF real com o Chromium disponível", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "encaixa-pdf-test-"));
    temporaryDirectories.push(dir);
    const output = path.join(dir, "resume.pdf");
    await expect(generatePdf("<!doctype html><h1>Currículo</h1>", output)).resolves.toBe(1);
    expect((await fs.stat(output)).size).toBeGreaterThan(500);
  }, 30_000);
});
