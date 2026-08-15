import { z } from "zod";

export const contactSchema = z.object({
  email: z.string().optional().default(""),
  phone: z.string().default(""),
  linkedin: z.string().default(""),
  github: z.string().default(""),
  location: z.string().default(""),
});
export const experienceSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  period: z.string().min(1),
  location: z.string().optional(),
  bullets: z.array(z.string().min(1)).min(1),
  skills: z.array(z.string()).optional(),
});
export const profileSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional().default(""),
  contact: contactSchema,
  summary: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  experience: z.array(experienceSchema),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      period: z.string(),
      status: z.string().optional(),
    }),
  ),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
});
export const profileDraftSchema = z.object({
  name: z.string().default(""),
  title: z.string().default(""),
  subtitle: z.string().default(""),
  contact: z
    .object({
      email: z.string().default(""),
      phone: z.string().default(""),
      linkedin: z.string().default(""),
      github: z.string().default(""),
      location: z.string().default(""),
    })
    .default({}),
  summary: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string().default(""),
        company: z.string().default(""),
        period: z.string().default(""),
        location: z.string().optional(),
        bullets: z.array(z.string()).default([]),
        skills: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().default(""),
        institution: z.string().default(""),
        period: z.string().default(""),
        status: z.string().default(""),
      }),
    )
    .default([]),
  languages: z
    .array(z.object({ language: z.string().default(""), level: z.string().default("") }))
    .default([]),
});
export const requirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(["required", "preferred"]),
  matched: z.boolean(),
  evidence: z.array(z.string()),
});
export const suggestionSchema = z.object({
  id: z.string(),
  type: z.enum(["summary", "bullet", "skills"]),
  target: z.string(),
  original: z.string(),
  proposed: z.string(),
  reason: z.string(),
  evidenceRefs: z.array(z.string()).min(1),
});
export const gapDraftSchema = z.object({
  canAdd: z.boolean(),
  proposed: z.string(),
  reason: z.string(),
  evidenceRefs: z.array(z.string()),
  missingInfo: z.string(),
});
export const gapBatchDraftSchema = z.object({
  items: z
    .array(
      gapDraftSchema.extend({
        experienceIndex: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(3),
});
export const jobDraftSchema = z.object({
  company: z.string().default(""),
  role: z.string().default(""),
  text: z.string().default(""),
});
export const optimizationSchema = z.object({
  role: z.string(),
  company: z.string(),
  requirements: z.array(requirementSchema),
  relevantSkills: z.array(z.string()),
  gaps: z.array(z.string()),
  suggestions: z.array(suggestionSchema),
});
export const outputFileSchema = z.object({
  name: z.string(),
  url: z.string(),
  pages: z.number().int().nonnegative(),
  lang: z.enum(["ptbr", "en"]),
});
export const decisionSchema = z.object({
  suggestionId: z.string().min(1),
  accepted: z.boolean(),
  customText: z.string().trim().min(1).max(5_000).optional(),
});
export const jobWorkflowSchema = z.object({
  version: z.literal(1),
  step: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  provider: z.enum(["codex", "claude"]),
  languages: z.array(z.enum(["ptbr", "en"])).min(1),
  files: z.array(outputFileSchema),
  updatedAt: z.string(),
  analyzedAt: z.string().optional(),
  reviewedAt: z.string().optional(),
  generatedAt: z.string().optional(),
  reviewBaseline: z
    .object({
      score: z.number().int().min(0).max(100),
      initialGapCount: z.number().int().nonnegative(),
      suggestionIds: z.array(z.string()),
    })
    .optional(),
});
export type Profile = z.infer<typeof profileSchema>;
export type ProfileDraft = z.infer<typeof profileDraftSchema>;
export type Optimization = z.infer<typeof optimizationSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type GapDraft = z.infer<typeof gapDraftSchema>;
export type GapBatchDraft = z.infer<typeof gapBatchDraftSchema>;
export type JobDraft = z.infer<typeof jobDraftSchema>;
export type OutputFile = z.infer<typeof outputFileSchema>;
export type JobWorkflow = z.infer<typeof jobWorkflowSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type AnalysisStage =
  "preparing" | "checking_provider" | "analyzing" | "processing_result" | "saving";
export type AnalysisProgressEvent = {
  type: "progress";
  stage: AnalysisStage;
  progress: number;
  title: string;
  message: string;
};
export type AnalysisActivityEvent = {
  type: "activity";
  stage: AnalysisStage;
  message: string;
  timestamp: string;
};
export type AnalysisHeartbeatEvent = {
  type: "heartbeat";
  stage: AnalysisStage;
  timestamp: string;
  elapsedMs: number;
};
export type AnalysisCompleteEvent = {
  type: "complete";
  data: Optimization & { score: number };
};
export type AnalysisErrorEvent = {
  type: "error";
  stage: AnalysisStage;
  message: string;
  statusCode: number;
};
export type AnalysisStreamEvent =
  | AnalysisProgressEvent
  | AnalysisActivityEvent
  | AnalysisHeartbeatEvent
  | AnalysisCompleteEvent
  | AnalysisErrorEvent;

export type ImportStage =
  "reading_file" | "checking_provider" | "extracting" | "validating" | "saving";
export type ImportProgressEvent = {
  type: "progress";
  stage: ImportStage;
  progress: number;
  title: string;
  message: string;
};
export type ImportActivityEvent = {
  type: "activity";
  stage: ImportStage;
  message: string;
  timestamp: string;
};
export type ImportHeartbeatEvent = {
  type: "heartbeat";
  stage: ImportStage;
  timestamp: string;
  elapsedMs: number;
};
export type ImportCompleteEvent = {
  type: "complete";
  data: { profile: ProfileDraft; provider: "codex" | "claude" };
};
export type ImportErrorEvent = {
  type: "error";
  stage: ImportStage;
  message: string;
  statusCode: number;
};
export type ImportStreamEvent =
  | ImportProgressEvent
  | ImportActivityEvent
  | ImportHeartbeatEvent
  | ImportCompleteEvent
  | ImportErrorEvent;

export type JobImportStage =
  "validating_url" | "checking_provider" | "loading_page" | "extracting" | "validating";
export type JobImportProgressEvent = {
  type: "progress";
  stage: JobImportStage;
  progress: number;
  title: string;
  message: string;
};
export type JobImportActivityEvent = {
  type: "activity";
  stage: JobImportStage;
  message: string;
  timestamp: string;
};
export type JobImportHeartbeatEvent = {
  type: "heartbeat";
  stage: JobImportStage;
  timestamp: string;
  elapsedMs: number;
};
export type JobImportCompleteEvent = {
  type: "complete";
  data: JobDraft & { sourceUrl: string; provider: "codex" | "claude" };
};
export type JobImportErrorEvent = {
  type: "error";
  stage: JobImportStage;
  message: string;
  statusCode: number;
};
export type JobImportStreamEvent =
  | JobImportProgressEvent
  | JobImportActivityEvent
  | JobImportHeartbeatEvent
  | JobImportCompleteEvent
  | JobImportErrorEvent;
