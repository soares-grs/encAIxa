import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  profileDraftSchema,
  jobDraftSchema,
  decisionSchema,
  type AnalysisActivityEvent,
  type AnalysisProgressEvent,
  type AnalysisStage,
  type Decision,
  type ImportActivityEvent,
  type ImportProgressEvent,
  type ImportStage,
  type JobImportActivityEvent,
  type JobImportProgressEvent,
  type JobImportStage,
} from "../shared/schemas.js";
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
import { captureJobPage } from "./job-page.js";
import { applyDecisions, generatePdf, renderResume } from "./resume.js";
import {
  jobDir,
  listJobs,
  makeJobId,
  paths,
  readAnalysis,
  readOnboarding,
  readDecisions,
  readJob,
  readProfile,
  readProfileSnapshot,
  readWorkflow,
  saveAnalysis,
  saveOnboardingDraft,
  saveDecisions,
  saveJob,
  saveProfileSnapshot,
  updateWorkflow,
  invalidateJobDerived,
  writeProfile,
  completeOnboarding,
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
  "/api/onboarding",
  wrap(async (_req: any, res: any) => res.json(await readOnboarding())),
);
app.put(
  "/api/onboarding/draft",
  wrap(async (req: any, res: any) => {
    const body = z
      .object({
        mode: z.enum(["manual", "import"]),
        step: z.number().int().min(0).max(4),
        provider: z.enum(["codex", "claude"]).optional(),
        profile: profileDraftSchema,
      })
      .parse(req.body);
    res.json(await saveOnboardingDraft(body));
  }),
);
app.post(
  "/api/onboarding/import",
  upload.single("file"),
  wrap(async (req: any, res: any) => {
    if (!req.file) throw new ProviderError("Selecione um arquivo para importar.", 400);
    const extension = path.extname(req.file.originalname).toLowerCase();
    let profile;
    let providerId: ProviderId = "codex";
    if (extension === ".json") {
      try {
        profile = profileDraftSchema.parse(JSON.parse(req.file.buffer.toString("utf8")));
      } catch {
        throw new ProviderError("O arquivo JSON não contém um perfil válido.", 400);
      }
    } else {
      providerId = isProviderId(req.body.provider) ? req.body.provider : "codex";
      const provider = await requireReady(getProvider(providerId));
      const text = await extractText(req.file);
      profile = await executeProvider(() => provider.extractProfile(text));
    }
    await saveOnboardingDraft({ mode: "import", step: 4, provider: providerId, profile });
    res.json({ profile, provider: providerId });
  }),
);
app.post("/api/onboarding/import/stream", upload.single("file"), async (req: any, res: any) => {
  let stage: ImportStage = "reading_file";
  const startedAt = Date.now();
  const send = (event: object) => res.write(`${JSON.stringify(event)}\n`);
  res.status(200);
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const progress = (event: Omit<ImportProgressEvent, "type">) => {
    stage = event.stage;
    send({ type: "progress", ...event });
  };
  const activity = (message: string): void =>
    send({
      type: "activity",
      stage,
      message,
      timestamp: new Date().toISOString(),
    } satisfies ImportActivityEvent);
  const heartbeat = setInterval(
    () =>
      send({
        type: "heartbeat",
        stage,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      }),
    5_000,
  );
  try {
    if (!req.file) throw new ProviderError("Selecione um arquivo para importar.", 400);
    progress({
      stage: "reading_file",
      progress: 10,
      title: "Lendo seu currículo",
      message: `Preparando ${req.file.originalname} para a importação.`,
    });
    const extension = path.extname(req.file.originalname).toLowerCase();
    let profile;
    let providerId: ProviderId = "codex";
    if (extension === ".json") {
      try {
        profile = profileDraftSchema.parse(JSON.parse(req.file.buffer.toString("utf8")));
      } catch {
        throw new ProviderError("O arquivo JSON não contém um perfil válido.", 400);
      }
    } else {
      progress({
        stage: "checking_provider",
        progress: 22,
        title: "Verificando a IA",
        message: "Confirmando que o provedor escolhido está conectado.",
      });
      providerId = isProviderId(req.body.provider) ? req.body.provider : "codex";
      const provider = await requireReady(getProvider(providerId));
      const text = await extractText(req.file);
      activity("Texto do currículo extraído com segurança.");
      progress({
        stage: "extracting",
        progress: 38,
        title: `${provider.label} está organizando seu perfil`,
        message: "Identificando experiências, formação, competências e contatos.",
      });
      const activityMessages = {
        session_started: `Sessão segura do ${provider.label} iniciada.`,
        response_in_progress: `${provider.label} está estruturando as informações.`,
        response_refined: `${provider.label} está refinando o perfil.`,
        result_received: `Resposta do ${provider.label} recebida.`,
      } as const;
      profile = await executeProvider(() =>
        provider.extractProfile(text, (providerActivity) =>
          activity(activityMessages[providerActivity]),
        ),
      );
    }
    progress({
      stage: "validating",
      progress: 84,
      title: "Conferindo os dados",
      message: "Validando o perfil antes de mostrar a revisão.",
    });
    profile = profileDraftSchema.parse(profile);
    progress({
      stage: "saving",
      progress: 95,
      title: "Preparando a revisão",
      message: "Salvando o rascunho localmente.",
    });
    await saveOnboardingDraft({ mode: "import", step: 4, provider: providerId, profile });
    send({ type: "complete", data: { profile, provider: providerId } });
  } catch (error) {
    send({
      type: "error",
      stage,
      message:
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : "Não foi possível importar o currículo.",
      statusCode:
        error instanceof ProviderError ? error.statusCode : error instanceof z.ZodError ? 400 : 500,
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
app.post(
  "/api/onboarding/complete",
  wrap(async (req: any, res: any) => res.json(await completeOnboarding(req.body.profile))),
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
app.post("/api/jobs/extract/stream", async (req: any, res: any) => {
  let stage: JobImportStage = "validating_url";
  const startedAt = Date.now();
  const send = (event: object) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  res.status(200);
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const progress = (event: Omit<JobImportProgressEvent, "type">) => {
    stage = event.stage;
    send({ type: "progress", ...event });
  };
  const activity = (message: string) =>
    send({
      type: "activity",
      stage,
      message,
      timestamp: new Date().toISOString(),
    } satisfies JobImportActivityEvent);
  const heartbeat = setInterval(
    () =>
      send({
        type: "heartbeat",
        stage,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      }),
    5_000,
  );
  try {
    const input = z
      .object({ url: z.string().min(1).max(2_048), provider: z.enum(["codex", "claude"]) })
      .parse(req.body);
    progress({
      stage: "validating_url",
      progress: 8,
      title: "Validando o link",
      message: "Conferindo se a página é pública e segura para acesso.",
    });
    progress({
      stage: "checking_provider",
      progress: 18,
      title: "Verificando a IA",
      message: "Confirmando que o provedor escolhido está conectado.",
    });
    const provider = await requireReady(getProvider(input.provider));
    progress({
      stage: "loading_page",
      progress: 30,
      title: "Abrindo a página da vaga",
      message: "Carregando conteúdo público, metadados e dados estruturados.",
    });
    const page = await captureJobPage(input.url);
    activity("Conteúdo público da página carregado com segurança.");
    progress({
      stage: "extracting",
      progress: 52,
      title: `${provider.label} está identificando a oportunidade`,
      message: "Separando empresa, cargo, responsabilidades e requisitos.",
    });
    const activityMessages = {
      session_started: `Sessão segura do ${provider.label} iniciada.`,
      response_in_progress: `${provider.label} está estruturando os dados da vaga.`,
      response_refined: `${provider.label} está refinando a descrição.`,
      result_received: `Resposta do ${provider.label} recebida.`,
    } as const;
    const draft = await executeProvider(() =>
      provider.extractJob(page.content, (providerActivity) =>
        activity(activityMessages[providerActivity]),
      ),
    );
    progress({
      stage: "validating",
      progress: 92,
      title: "Preparando sua revisão",
      message: "Validando os campos extraídos antes de preencher o formulário.",
    });
    send({
      type: "complete",
      data: { ...jobDraftSchema.parse(draft), sourceUrl: page.sourceUrl, provider: input.provider },
    });
  } catch (error) {
    send({
      type: "error",
      stage,
      message:
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : "Não foi possível capturar os dados da vaga.",
      statusCode:
        error instanceof ProviderError ? error.statusCode : error instanceof z.ZodError ? 400 : 500,
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
app.post(
  "/api/jobs",
  wrap(async (req: any, res: any) => {
    const body = z
      .object({
        company: z.string().min(1),
        role: z.string().min(1),
        text: z.string().min(20),
        sourceUrl: z.string().url().max(2_048).optional(),
      })
      .parse(req.body);
    const id = makeJobId(body.company, body.role);
    const createdAt = new Date().toISOString();
    await saveJob(id, { ...body, createdAt });
    const workflow = await readWorkflow(id);
    res.status(201).json({ id, ...body, createdAt, workflow });
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
    const workflow = await readWorkflow(req.params.id);
    const profileSnapshot = analysis ? await readProfileSnapshot(req.params.id) : null;
    res.json({
      id: req.params.id,
      ...job,
      analysis: analysis ? { ...analysis, score: score(analysis.requirements) } : null,
      decisions,
      workflow,
      files: workflow.files,
      profileSnapshot,
    });
  }),
);
app.put(
  "/api/jobs/:id",
  wrap(async (req: any, res: any) => {
    const body = z
      .object({
        company: z.string().min(1),
        role: z.string().min(1),
        text: z.string().min(20),
        sourceUrl: z.string().url().max(2_048).optional(),
        invalidate: z.boolean().default(false),
      })
      .parse(req.body);
    const current = await readJob(req.params.id);
    const workflow = await readWorkflow(req.params.id);
    if (workflow.step > 2 && !body.invalidate)
      throw new ProviderError("Confirme a reanálise antes de alterar uma vaga analisada.", 409);
    await saveJob(req.params.id, {
      ...current,
      company: body.company,
      role: body.role,
      text: body.text,
      sourceUrl: body.sourceUrl,
      updatedAt: new Date().toISOString(),
    });
    if (body.invalidate) await invalidateJobDerived(req.params.id);
    res.json({ id: req.params.id, ...(await readJob(req.params.id)) });
  }),
);
app.post(
  "/api/jobs/:id/analyze",
  wrap(async (req: any, res: any) => {
    res.json(await analyzeJob(req.params.id, req.body?.provider));
  }),
);
app.post("/api/jobs/:id/analyze/stream", async (req: any, res: any) => {
  res.status(200);
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  let currentStage: AnalysisStage = "preparing";
  const startedAt = Date.now();
  const send = (event: object) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  const heartbeat = setInterval(
    () =>
      send({
        type: "heartbeat",
        stage: currentStage,
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
      }),
    4_000,
  );
  res.once("close", () => clearInterval(heartbeat));
  try {
    const data = await analyzeJob(req.params.id, req.body?.provider, (event) => {
      currentStage = event.stage;
      send(event);
    });
    send({ type: "complete", data });
  } catch (error) {
    send({
      type: "error",
      stage: currentStage,
      message:
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : "Erro inesperado durante a análise.",
      statusCode:
        error instanceof ProviderError ? error.statusCode : error instanceof z.ZodError ? 400 : 500,
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
const gapContextSchema = z.object({
  gap: z.string().min(1),
  gapIndex: z.number().int().nonnegative(),
  experienceIndex: z.number().int().nonnegative(),
  context: z.string().trim().min(30, "Conte um pouco mais sobre essa experiência.").max(2_000),
});
app.post(
  "/api/jobs/:id/gaps/draft",
  wrap(async (req: any, res: any) => {
    const input = gapContextSchema.parse(req.body);
    const [analysis, profile, job] = await Promise.all([
      readAnalysis(req.params.id),
      readProfileSnapshot(req.params.id),
      readJob(req.params.id),
    ]);
    const gap = analysis.gaps[input.gapIndex];
    if (!gap || gap !== input.gap)
      throw new ProviderError("Essa lacuna mudou. Atualize a candidatura e tente novamente.", 409);
    const experience = profile.experience[input.experienceIndex];
    if (!experience) throw new ProviderError("Experiência profissional inválida.", 400);
    const providerId: ProviderId = isProviderId(job.provider) ? job.provider : "codex";
    const provider = await requireReady(getProvider(providerId));
    const draft = await executeProvider(() =>
      provider.fillGap({ gap, context: input.context, experience }),
    );
    res.json(draft);
  }),
);
app.post(
  "/api/jobs/:id/gaps/confirm",
  wrap(async (req: any, res: any) => {
    const input = gapContextSchema
      .extend({
        proposed: z.string().trim().min(10).max(600),
        reason: z.string().trim().min(1).max(1_000),
        evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(8),
      })
      .parse(req.body);
    const [analysis, profile, decisions] = await Promise.all([
      readAnalysis(req.params.id),
      readProfileSnapshot(req.params.id),
      readDecisions(req.params.id),
    ]);
    if (analysis.gaps[input.gapIndex] !== input.gap)
      throw new ProviderError("Essa lacuna mudou. Atualize a candidatura e tente novamente.", 409);
    if (!profile.experience[input.experienceIndex])
      throw new ProviderError("Experiência profissional inválida.", 400);
    const suggestionId = `gap-${randomUUID()}`;
    const verifiedEvidence = input.evidenceRefs
      .filter((reference) => input.context.includes(reference))
      .slice(0, 5);
    const updatedAnalysis = {
      ...analysis,
      gaps: analysis.gaps.filter((_, index) => index !== input.gapIndex),
      suggestions: [
        ...analysis.suggestions,
        {
          id: suggestionId,
          type: "bullet" as const,
          target: `experience.${input.experienceIndex}.bullets.append`,
          original: "",
          proposed: input.proposed,
          reason: input.reason,
          evidenceRefs: verifiedEvidence.length
            ? verifiedEvidence
            : [`Contexto informado pelo usuário: ${input.context.slice(0, 300)}`],
        },
      ],
    };
    const updatedDecisions = [
      ...decisions.filter((decision) => decision.suggestionId !== suggestionId),
      { suggestionId, accepted: true },
    ];
    await saveAnalysis(req.params.id, updatedAnalysis);
    await saveDecisions(req.params.id, updatedDecisions);
    res.json({
      analysis: { ...updatedAnalysis, score: score(updatedAnalysis.requirements) },
      decisions: updatedDecisions,
    });
  }),
);
app.put(
  "/api/jobs/:id/decisions",
  wrap(async (req: any, res: any) => {
    const decisions = z.array(decisionSchema).parse(req.body);
    const analysis = await readAnalysis(req.params.id);
    const suggestionIds = new Set(analysis.suggestions.map((suggestion) => suggestion.id));
    if (decisions.some((decision) => !suggestionIds.has(decision.suggestionId)))
      throw new ProviderError("Uma das sugestões não pertence a esta candidatura.", 409);
    await saveDecisions(req.params.id, decisions);
    res.json(decisions);
  }),
);
app.put(
  "/api/jobs/:id/decisions/:suggestionId",
  wrap(async (req: any, res: any) => {
    const input = z
      .object({
        accepted: z.boolean(),
        customText: z.string().trim().min(1).max(5_000).nullable().optional(),
      })
      .parse(req.body);
    const analysis = await readAnalysis(req.params.id);
    if (!analysis.suggestions.some((suggestion) => suggestion.id === req.params.suggestionId))
      throw new ProviderError("Sugestão não encontrada nesta candidatura.", 409);
    const decisions = await readDecisions(req.params.id);
    const current = decisions.find((decision) => decision.suggestionId === req.params.suggestionId);
    const customText =
      input.customText === undefined ? current?.customText : input.customText || undefined;
    const updated = [
      ...decisions.filter((decision) => decision.suggestionId !== req.params.suggestionId),
      decisionSchema.parse({
        suggestionId: req.params.suggestionId,
        accepted: input.accepted,
        ...(customText ? { customText } : {}),
      }),
    ];
    await saveDecisions(req.params.id, updated);
    res.json(updated);
  }),
);
app.patch(
  "/api/jobs/:id/workflow",
  wrap(async (req: any, res: any) => {
    const patch = z
      .object({
        step: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
        languages: z
          .array(z.enum(["ptbr", "en"]))
          .min(1)
          .optional(),
      })
      .parse(req.body);
    res.json(
      await updateWorkflow(req.params.id, {
        ...patch,
        ...(patch.step === 4 ? { reviewedAt: new Date().toISOString() } : {}),
      }),
    );
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
          await readProfileSnapshot(req.params.id),
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
    const profile = await readProfileSnapshot(req.params.id),
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
    await updateWorkflow(req.params.id, {
      step: 4,
      languages: langs,
      files,
      generatedAt: new Date().toISOString(),
    });
    res.json({ files });
  }),
);
app.get(
  "/api/jobs/:id/download/:file",
  wrap(async (req: any, res: any) => {
    if (!/^(encaixa|cv)-(ptbr|en)\.(pdf|html)$/.test(req.params.file)) return res.sendStatus(400);
    res.download(path.join(paths.output, req.params.id, req.params.file));
  }),
);
async function analyzeJob(
  id: string,
  requestedProvider: unknown,
  report: (event: AnalysisProgressEvent | AnalysisActivityEvent) => void = () => {},
) {
  report({
    type: "progress",
    stage: "preparing",
    progress: 8,
    title: "Preparando sua candidatura",
    message: "Carregando seu perfil e a descrição da vaga.",
  });
  const [job, profile] = await Promise.all([readJob(id), readProfile()]);
  const providerId: ProviderId = isProviderId(requestedProvider)
    ? requestedProvider
    : isProviderId(job.provider)
      ? job.provider
      : "codex";
  report({
    type: "progress",
    stage: "checking_provider",
    progress: 18,
    title: "Verificando o provedor",
    message: `Confirmando que o ${providerId === "claude" ? "Claude" : "Codex"} está disponível e conectado.`,
  });
  const provider = await requireReady(getProvider(providerId));
  await saveProfileSnapshot(id, profile);
  report({
    type: "progress",
    stage: "analyzing",
    progress: 36,
    title: `${provider.label} está analisando a vaga`,
    message: "Comparando requisitos com evidências reais da sua trajetória.",
  });
  const activityMessages = {
    session_started: `Sessão segura do ${provider.label} iniciada.`,
    response_in_progress: `${provider.label} está estruturando a análise.`,
    response_refined: `${provider.label} está refinando a resposta.`,
    result_received: `Resposta do ${provider.label} recebida.`,
  } as const;
  let lastActivity = "";
  const analysis = await executeProvider(() =>
    provider.optimize(profile, job, (activity) => {
      const message = activityMessages[activity];
      if (message === lastActivity) return;
      lastActivity = message;
      report({
        type: "activity",
        stage: "analyzing",
        message,
        timestamp: new Date().toISOString(),
      });
    }),
  );
  report({
    type: "progress",
    stage: "processing_result",
    progress: 82,
    title: "Conferindo o resultado",
    message: "Validando requisitos, lacunas e sugestões antes de exibir tudo para você.",
  });
  const result = { ...analysis, score: score(analysis.requirements) };
  report({
    type: "progress",
    stage: "saving",
    progress: 94,
    title: "Salvando a análise",
    message: "Guardando o resultado somente nesta candidatura.",
  });
  await saveJob(id, { ...job, provider: providerId });
  await saveAnalysis(id, analysis);
  await saveDecisions(
    id,
    analysis.suggestions.map((suggestion) => ({ suggestionId: suggestion.id, accepted: false })),
  );
  await updateWorkflow(id, {
    step: 3,
    provider: providerId,
    files: [],
    analyzedAt: new Date().toISOString(),
  });
  return result;
}
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
