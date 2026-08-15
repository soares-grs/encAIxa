import type { Profile } from "../../shared/schemas.js";

export const optimizationPrompt = (
  profile: Profile,
  job: { company: string; role: string; text: string },
) =>
  `Você é um especialista em currículos ATS. Analise somente os fatos fornecidos. Não invente competências, números, cargos ou resultados. Lacunas devem permanecer como lacunas. Cada evidenceRefs deve citar literalmente um trecho ou caminho do PERFIL. Sugira mudanças individuais. Targets aceitos: summary; experience.N.bullets.N; skills. Para skills, original pode ser vazio e proposed deve ser uma lista separada por vírgulas. Retorne somente dados que correspondam ao schema solicitado.\n\nPERFIL:\n${JSON.stringify(profile)}\n\nVAGA:\n${JSON.stringify(job)}`;

export const translationPrompt = (profile: Profile) =>
  `Traduza este currículo para inglês profissional natural. Preserve rigorosamente empresas, tecnologias, números, links e todos os fatos. Não acrescente nem remova informação. Retorne somente dados que correspondam ao schema solicitado. PERFIL: ${JSON.stringify(profile)}`;
