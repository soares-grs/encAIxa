import { z } from "zod";

export const contactSchema = z.object({
  email: z.string().optional().default(""), phone: z.string().default(""),
  linkedin: z.string().default(""), github: z.string().default(""), location: z.string().default("")
});
export const experienceSchema = z.object({
  title: z.string().min(1), company: z.string().min(1), period: z.string().min(1),
  location: z.string().optional(), bullets: z.array(z.string().min(1)).min(1), skills: z.array(z.string()).optional()
});
export const profileSchema = z.object({
  name: z.string().min(1), title: z.string().min(1), subtitle: z.string().optional().default(""),
  contact: contactSchema, summary: z.string().min(1), skills: z.array(z.string().min(1)).default([]), experience: z.array(experienceSchema),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), period: z.string(), status: z.string().optional() })),
  languages: z.array(z.object({ language: z.string(), level: z.string() }))
});
export const requirementSchema = z.object({ id: z.string(), text: z.string(), kind: z.enum(["required", "preferred"]), matched: z.boolean(), evidence: z.array(z.string()) });
export const suggestionSchema = z.object({
  id: z.string(), type: z.enum(["summary", "bullet", "skills"]), target: z.string(),
  original: z.string(), proposed: z.string(), reason: z.string(), evidenceRefs: z.array(z.string()).min(1)
});
export const optimizationSchema = z.object({
  role: z.string(), company: z.string(), requirements: z.array(requirementSchema),
  relevantSkills: z.array(z.string()), gaps: z.array(z.string()), suggestions: z.array(suggestionSchema)
});
export type Profile = z.infer<typeof profileSchema>;
export type Optimization = z.infer<typeof optimizationSchema>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type Decision = { suggestionId: string; accepted: boolean };
