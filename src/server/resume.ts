import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { PDFParse } from "pdf-parse";
import type { Decision, Optimization, Profile } from "../shared/schemas.js";

const escape = (s = "") =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function applyDecisions(
  profile: Profile,
  analysis?: Optimization,
  decisions: Decision[] = [],
) {
  const result = structuredClone(profile);
  const accepted = new Set(decisions.filter((d) => d.accepted).map((d) => d.suggestionId));
  for (const suggestion of analysis?.suggestions ?? []) {
    if (!accepted.has(suggestion.id) || suggestion.type === "skills") continue;
    if (suggestion.target === "summary") result.summary = suggestion.proposed;
    const match = suggestion.target.match(/^experience\.(\d+)\.bullets\.(\d+)$/);
    if (match && result.experience[+match[1]]?.bullets[+match[2]] !== undefined)
      result.experience[+match[1]].bullets[+match[2]] = suggestion.proposed;
  }
  return result;
}
const labels = {
  ptbr: {
    summary: "RESUMO PROFISSIONAL",
    skills: "COMPETÊNCIAS TÉCNICAS",
    experience: "EXPERIÊNCIAS PROFISSIONAIS",
    education: "FORMAÇÃO ACADÊMICA E IDIOMAS",
    present: "Atual",
  },
  en: {
    summary: "PROFESSIONAL SUMMARY",
    skills: "TECHNICAL SKILLS",
    experience: "PROFESSIONAL EXPERIENCE",
    education: "EDUCATION AND LANGUAGES",
    present: "Present",
  },
};
export async function renderResume(
  profile: Profile,
  lang: "ptbr" | "en",
  analysis?: Optimization,
  decisions: Decision[] = [],
) {
  const p = applyDecisions(profile, analysis, decisions);
  const l = labels[lang];
  const relevant = analysis?.relevantSkills?.length
    ? analysis.relevantSkills
    : p.skills.slice(0, 24);
  const contacts = [
    p.contact.email,
    p.contact.phone,
    p.contact.linkedin,
    p.contact.github,
    p.contact.location,
  ]
    .filter(Boolean)
    .map(escape)
    .join(" · ");
  const jobs = p.experience
    .map(
      (x) =>
        `<article class="job"><header><div><h3>${escape(x.title)}</h3><span>${escape(x.company)}</span></div><time>${escape(x.period)}</time></header><ul>${x.bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul></article>`,
    )
    .join("");
  const education = p.education
    .map(
      (e) =>
        `<div class="edu"><strong>${escape(e.degree)}</strong><span>${escape(e.period)}</span><p>${escape(e.institution)}${e.status ? ` · ${escape(e.status)}` : ""}</p></div>`,
    )
    .join("");
  const languages = p.languages
    .map((x) => `<p>${escape(x.language)} · ${escape(x.level)}</p>`)
    .join("");
  return `<!doctype html><html lang="${lang === "en" ? "en" : "pt-BR"}"><head><meta charset="utf-8"><style>${resumeCss}</style></head><body><main><div class="top"><h1>${escape(p.name)}</h1><h2>${escape(lang === "en" ? "Software Engineer" : p.title)}</h2><p>${contacts}</p></div><section><h2>${l.summary}</h2><p class="summary">${escape(p.summary)}</p></section><section><h2>${l.skills}</h2><p class="skills">${relevant.map(escape).join(" · ")}</p></section><section><h2>${l.experience}</h2>${jobs}</section><section><h2>${l.education}</h2>${education}${languages}</section></main></body></html>`;
}
const resumeCss = `@page{size:A4;margin:12mm 15mm}*{box-sizing:border-box}body{margin:0;font:9.2pt/1.35 Arial,sans-serif;color:#242424}main{max-width:180mm;margin:auto}.top{text-align:center;border-bottom:2px solid #202020;padding-bottom:8px;margin-bottom:11px}.top h1{font-size:18pt;letter-spacing:.7px;margin:0}.top h2{font-size:10.5pt;font-weight:400;margin:3px}.top p{font-size:8.4pt;color:#555;margin:0}section{margin-bottom:10px}section>h2{font-size:10pt;border-bottom:1px solid #bbb;margin:0 0 6px;padding-bottom:2px}.summary,.skills{margin:0;text-align:justify}.job{margin-bottom:8px;break-inside:avoid}.job header{display:flex;justify-content:space-between}.job h3{display:inline;font-size:9.6pt;margin:0}.job header span{font-style:italic;color:#555;margin-left:7px}.job time{font-size:8.7pt;color:#555}.job ul{margin:3px 0 0 15px;padding:0}.job li{margin-bottom:1px}.edu{break-inside:avoid}.edu span{float:right}.edu p{margin:1px 0 4px;color:#555;font-style:italic}`;
function executablePath() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : [];
  return process.env.PUPPETEER_EXECUTABLE_PATH || candidates.find((p) => existsSync(p));
}
export async function generatePdf(html: string, outputPath: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: ["--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
  const parser = new PDFParse({ data: await fs.readFile(outputPath) });
  try {
    return (await parser.getInfo()).total;
  } finally {
    await parser.destroy();
  }
}
