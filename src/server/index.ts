import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { Decision } from "../shared/schemas.js";
import { codexStatus, startLogin } from "./codex.js";
import {
  getProvider,
  executeProvider,
  isProviderId,
  providerStatuses,
  requireReady,
  type ProviderId,
} from "./providers/index.js";
import { ProviderError } from "./providers/types.js";
import { extractText } from "./importer.js";
import { applyDecisions, generatePdf, renderResume } from "./resume.js";
import {
  jobDir,
  listJobs,
  makeJobId,
  paths,
  readAnalysis,
  readDecisions,
  readJob,
  readProfile,
  saveAnalysis,
  saveDecisions,
  saveJob,
  writeProfile,
} from "./storage.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
    return res.status(403).json({ error: "Origem não permitida." });
  next();
});
const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get(
  "/api/codex/status",
  wrap(async (_req: any, res: any) => res.json(await codexStatus())),
);
app.post("/api/codex/login", (_req, res) => {
  startLogin();
  res.status(202).json({ ok: true });
});
app.get(
  "/api/providers/status",
  wrap(async (_req: any, res: any) => res.json(await providerStatuses())),
);
app.post(
  "/api/providers/:provider/login",
  wrap(async (req: any, res: any) => {
    const provider = getProvider(req.params.provider);
    const status = await provider.status();
    if (!status.installed)
      throw new ProviderError(`${provider.label} CLI não está instalado.`, 409);
    provider.startLogin();
    res.status(202).json({ ok: true });
  }),
);
app.get(
  "/api/profile",
  wrap(async (_req: any, res: any) => res.json(await readProfile())),
);
app.put(
  "/api/profile",
  wrap(async (req: any, res: any) => res.json(await writeProfile(req.body))),
);
app.get(
  "/api/jobs",
  wrap(async (_req: any, res: any) => res.json(await listJobs())),
);
app.post(
  "/api/import",
  upload.single("file"),
  wrap(async (req: any, res: any) => {
    if (!req.file) throw new Error("Selecione um arquivo.");
    res.json({ text: await extractText(req.file) });
  }),
);
app.post(
  "/api/jobs",
  wrap(async (req: any, res: any) => {
    const body = z
      .object({ company: z.string().min(1), role: z.string().min(1), text: z.string().min(20) })
      .parse(req.body);
    const id = makeJobId(body.company, body.role);
    await saveJob(id, { ...body, createdAt: new Date().toISOString() });
    res.status(201).json({ id, ...body });
  }),
);
app.get(
  "/api/jobs/:id",
  wrap(async (req: any, res: any) => {
    const job = await readJob(req.params.id);
    let analysis = null,
      decisions: Decision[] = [];
    try {
      analysis = await readAnalysis(req.params.id);
      decisions = await readDecisions(req.params.id);
    } catch {}
    res.json({ id: req.params.id, ...job, analysis, decisions });
  }),
);
app.post(
  "/api/jobs/:id/analyze",
  wrap(async (req: any, res: any) => {
    const job = await readJob(req.params.id);
    const providerId: ProviderId = isProviderId(req.body?.provider)
      ? req.body.provider
      : isProviderId(job.provider)
        ? job.provider
        : "codex";
    const provider = await requireReady(getProvider(providerId));
    const analysis = await executeProvider(async () => provider.optimize(await readProfile(), job));
    await saveJob(req.params.id, { ...job, provider: providerId });
    await saveAnalysis(req.params.id, analysis);
    res.json({ ...analysis, score: score(analysis.requirements) });
  }),
);
app.put(
  "/api/jobs/:id/decisions",
  wrap(async (req: any, res: any) => {
    const decisions = z
      .array(z.object({ suggestionId: z.string(), accepted: z.boolean() }))
      .parse(req.body);
    await saveDecisions(req.params.id, decisions);
    res.json(decisions);
  }),
);
app.get(
  "/api/jobs/:id/preview/:lang",
  wrap(async (req: any, res: any) => {
    const lang = req.params.lang === "en" ? "en" : "ptbr";
    res
      .type("html")
      .send(
        await renderResume(
          await readProfile(),
          lang,
          await readAnalysis(req.params.id),
          await readDecisions(req.params.id),
        ),
      );
  }),
);
app.post(
  "/api/jobs/:id/generate",
  wrap(async (req: any, res: any) => {
    const langs = z
      .object({ languages: z.array(z.enum(["ptbr", "en"])).min(1) })
      .parse(req.body).languages;
    const profile = await readProfile(),
      analysis = await readAnalysis(req.params.id),
      decisions = await readDecisions(req.params.id),
      job = await readJob(req.params.id);
    const providerId: ProviderId = isProviderId(job.provider) ? job.provider : "codex";
    const dir = path.join(paths.output, req.params.id);
    const files = [];
    for (const lang of langs) {
      const variant = applyDecisions(profile, analysis, decisions);
      const finalProfile =
        lang === "en"
          ? await executeProvider(async () =>
              (await requireReady(getProvider(providerId))).translateProfile(variant),
            )
          : variant;
      const html = await renderResume(finalProfile, lang, undefined, []);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `encaixa-${lang}.html`), html);
      const name = `encaixa-${lang}.pdf`;
      const pages = await generatePdf(html, path.join(dir, name));
      files.push({ lang, name, pages, url: `/api/jobs/${req.params.id}/download/${name}` });
    }
    res.json({ files });
  }),
);
app.get(
  "/api/jobs/:id/download/:file",
  wrap(async (req: any, res: any) => {
    if (!/^encaixa-(ptbr|en)\.(pdf|html)$/.test(req.params.file)) return res.sendStatus(400);
    res.download(path.join(paths.output, req.params.id, req.params.file));
  }),
);
function score(requirements: any[]) {
  const max = requirements.reduce((n, r) => n + (r.kind === "required" ? 2 : 1), 0);
  const got = requirements.reduce(
    (n, r) => n + (r.matched ? (r.kind === "required" ? 2 : 1) : 0),
    0,
  );
  return max ? Math.round((got / max) * 100) : 0;
}
const dist = path.resolve("dist");
app.use(express.static(dist));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res
    .status(err instanceof ProviderError ? err.statusCode : err instanceof z.ZodError ? 400 : 500)
    .json({
      error:
        err instanceof z.ZodError
          ? err.issues.map((i) => i.message).join("; ")
          : err.message || "Erro inesperado.",
    });
});
app.listen(3001, "127.0.0.1", () => console.log("encAIxa: http://127.0.0.1:3001"));
