import dns from "node:dns/promises";
import net from "node:net";
import puppeteer from "puppeteer";
import { ProviderError } from "./providers/types.js";
import { resolvePdfBrowserExecutable } from "./resume.js";

const MAX_PAGE_CONTENT = 100_000;

export function formatCapturedJobPage(captured: {
  finalUrl: string;
  title: string;
  description: string;
  jsonLd: string;
  text: string;
}) {
  return [
    `URL FINAL: ${captured.finalUrl}`,
    `TÍTULO: ${captured.title}`,
    `DESCRIÇÃO META: ${captured.description}`,
    `DADOS ESTRUTURADOS:\n${captured.jsonLd}`,
    `TEXTO VISÍVEL:\n${captured.text}`,
  ]
    .join("\n\n")
    .replace(/\r/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_PAGE_CONTENT);
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 88 && parts[2] === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
    const words = mapped.split(":");
    if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/.test(word))) {
      const high = Number.parseInt(words[0], 16);
      const low = Number.parseInt(words[1], 16);
      return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return true;
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("2001:db8:")
  );
}

export async function validatePublicUrl(
  value: string,
  lookup: typeof dns.lookup = dns.lookup,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderError("Informe um link válido para a vaga.", 400);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new ProviderError("Use um link público HTTP ou HTTPS, sem credenciais.", 400);
  if (url.href.length > 2_048) throw new ProviderError("O link da vaga é muito longo.", 400);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new ProviderError("Links locais ou privados não são permitidos.", 400);
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ProviderError("Não foi possível localizar o endereço da vaga.", 502);
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address)))
    throw new ProviderError("Links locais ou privados não são permitidos.", 400);
  url.hash = "";
  return url.href;
}

export async function captureJobPage(
  value: string,
  validate: (url: string) => Promise<string> = validatePublicUrl,
) {
  const sourceUrl = await validate(value);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: await resolvePdfBrowserExecutable(),
      args: ["--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void (async () => {
        try {
          const requestUrl = request.url();
          if (/^(data|blob|about):/.test(requestUrl)) return request.continue();
          await validate(requestUrl);
          await request.continue();
        } catch {
          await request.abort("blockedbyclient").catch(() => {});
        }
      })();
    });
    const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 400)
      throw new ProviderError(
        `A página da vaga respondeu com status ${response?.status() || "desconhecido"}.`,
        502,
      );
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => {});
    const captured = await page.evaluate(() => ({
      title: document.title || "",
      description:
        document.querySelector('meta[name="description"]')?.getAttribute("content") ||
        document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
        "",
      jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((node) => node.textContent || "")
        .join("\n"),
      text: document.body?.innerText || "",
    }));
    const content = formatCapturedJobPage({ finalUrl: page.url(), ...captured });
    if (content.length < 20)
      throw new ProviderError("A página não contém texto suficiente para extrair a vaga.", 502);
    return { sourceUrl, content };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error
        ? `Não foi possível carregar a página da vaga: ${error.message}`
        : "Não foi possível carregar a página da vaga.",
      502,
    );
  } finally {
    await browser?.close();
  }
}
