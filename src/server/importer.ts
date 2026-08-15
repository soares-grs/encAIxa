import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const allowed = new Set([".txt", ".md", ".pdf", ".docx"]);
export async function extractText(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.has(ext)) throw new Error("Formato não suportado. Use DOCX, PDF, TXT ou MD.");
  let text = "";
  if (ext === ".txt" || ext === ".md") text = file.buffer.toString("utf8");
  if (ext === ".docx") text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (ext === ".pdf") { const parser = new PDFParse({ data: file.buffer }); try { text = (await parser.getText()).text; } finally { await parser.destroy(); } }
  text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("Não foi possível extrair texto do arquivo.");
  return text.slice(0, 100_000);
}
