import fs from "node:fs/promises";
import path from "node:path";
import {
  profileSchema,
  profileDraftSchema,
  optimizationSchema,
  type Decision,
  type Optimization,
  type Profile,
  type ProfileDraft,
} from "../shared/schemas.js";

const root = process.cwd();
export const paths = {
  root,
  profile: path.join(root, "storage", "profile.json"),
  onboarding: path.join(root, "storage", "onboarding.json"),
  jobs: path.join(root, "storage", "jobs"),
  output: path.join(root, "storage", "output"),
  exampleProfile: path.join(root, "examples", "profile.example.json"),
};
const safeSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "vaga";
export const makeJobId = (company: string, role: string) =>
  `${new Date().toISOString().slice(0, 10)}-${safeSlug(company)}-${safeSlug(role)}-${Date.now().toString().slice(-5)}`;
export const jobDir = (id: string) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Identificador de vaga inválido.");
  return path.join(paths.jobs, id);
};
async function ensureStorage() {
  await fs.mkdir(path.dirname(paths.profile), { recursive: true });
  await fs.mkdir(paths.jobs, { recursive: true });
  await fs.mkdir(paths.output, { recursive: true });
}
const emptyDraft = (): ProfileDraft =>
  profileDraftSchema.parse({ contact: {}, experience: [], education: [], languages: [] });
async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}
async function profileMatchesExample() {
  try {
    const [profile, example] = await Promise.all([
      fs.readFile(paths.profile, "utf8"),
      fs.readFile(paths.exampleProfile, "utf8"),
    ]);
    return JSON.stringify(JSON.parse(profile)) === JSON.stringify(JSON.parse(example));
  } catch {
    return false;
  }
}
export async function readOnboarding() {
  await ensureStorage();
  let saved: any = {};
  try {
    saved = JSON.parse(await fs.readFile(paths.onboarding, "utf8"));
  } catch {}
  let hasValidProfile = false;
  try {
    profileSchema.parse(JSON.parse(await fs.readFile(paths.profile, "utf8")));
    hasValidProfile = !(await profileMatchesExample());
  } catch {}
  return {
    completed: Boolean(saved.completedAt) || hasValidProfile,
    version: 1,
    mode: saved.mode === "import" ? "import" : saved.mode === "manual" ? "manual" : null,
    step: Number.isInteger(saved.step) ? Math.max(0, Math.min(4, saved.step)) : 0,
    provider: saved.provider === "claude" ? "claude" : "codex",
    profile: profileDraftSchema.parse(saved.profile || emptyDraft()),
    updatedAt: saved.updatedAt || null,
    completedAt: saved.completedAt || null,
  };
}
export async function saveOnboardingDraft(value: {
  mode: "manual" | "import";
  step: number;
  provider?: "codex" | "claude";
  profile: unknown;
}) {
  const current = await readOnboarding();
  if (current.completed) throw new Error("O perfil já está configurado.");
  const saved = {
    version: 1,
    mode: value.mode,
    step: Math.max(0, Math.min(4, Math.trunc(value.step))),
    provider: value.provider === "claude" ? "claude" : "codex",
    profile: profileDraftSchema.parse(value.profile),
    updatedAt: new Date().toISOString(),
  };
  await atomicJson(paths.onboarding, saved);
  return saved;
}
export async function completeOnboarding(value: unknown) {
  const profile = profileSchema.parse(value);
  await atomicJson(paths.profile, profile);
  await atomicJson(paths.onboarding, {
    version: 1,
    completedAt: new Date().toISOString(),
  });
  return profile;
}
export async function readProfile(): Promise<Profile> {
  await ensureStorage();
  return profileSchema.parse(JSON.parse(await fs.readFile(paths.profile, "utf8")));
}
export async function writeProfile(profile: unknown) {
  const parsed = profileSchema.parse(profile);
  await ensureStorage();
  await atomicJson(paths.profile, parsed);
  return parsed;
}
export async function saveJob(id: string, value: object) {
  const dir = jobDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "job.json"), JSON.stringify(value, null, 2) + "\n");
}
export async function readJob(id: string) {
  return JSON.parse(await fs.readFile(path.join(jobDir(id), "job.json"), "utf8"));
}
export async function saveAnalysis(id: string, analysis: Optimization) {
  await fs.writeFile(
    path.join(jobDir(id), "analysis.json"),
    JSON.stringify(optimizationSchema.parse(analysis), null, 2) + "\n",
  );
}
export async function readAnalysis(id: string) {
  return optimizationSchema.parse(
    JSON.parse(await fs.readFile(path.join(jobDir(id), "analysis.json"), "utf8")),
  );
}
export async function saveDecisions(id: string, decisions: Decision[]) {
  await fs.writeFile(
    path.join(jobDir(id), "decisions.json"),
    JSON.stringify(decisions, null, 2) + "\n",
  );
}
export async function readDecisions(id: string): Promise<Decision[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(jobDir(id), "decisions.json"), "utf8"));
  } catch {
    return [];
  }
}
export async function listJobs() {
  await ensureStorage();
  const entries = await fs.readdir(paths.jobs, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        try {
          return { id: e.name, ...(await readJob(e.name)) };
        } catch {
          return null;
        }
      }),
  );
  return jobs
    .filter(Boolean)
    .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
