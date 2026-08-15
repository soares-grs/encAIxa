export function safeFilenamePart(value: string, fallback: string, maximum: number) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, maximum)
    .replace(/_+$/g, "");
  return normalized || fallback;
}

export function resumeFilename(
  profileName: string,
  role: string,
  company: string,
  language: "ptbr" | "en",
) {
  const candidate = safeFilenamePart(profileName, "Candidato", 32);
  const jobRole = safeFilenamePart(role, "Cargo", 32);
  const jobCompany = safeFilenamePart(company, "Empresa", 24);
  return `${candidate}_Curriculo_${jobRole}_${jobCompany}${language === "en" ? "_EN" : ""}.pdf`;
}
