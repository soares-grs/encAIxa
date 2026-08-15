import { describe, expect, it, vi } from "vitest";
import { formatCapturedJobPage, isPrivateAddress, validatePublicUrl } from "./job-page.js";

const lookupWith = (addresses: string[]) =>
  vi.fn(async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
  ) as any;

describe("captura segura de páginas de vaga", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("reconhece %s como endereço privado ou reservado", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it("normaliza uma URL pública e remove o fragmento", async () => {
    await expect(
      validatePublicUrl(
        " https://jobs.example.com/vaga?id=1#detalhes ",
        lookupWith(["93.184.216.34"]),
      ),
    ).resolves.toBe("https://jobs.example.com/vaga?id=1");
  });

  it.each([
    "http://localhost:3001/api/profile",
    "file:///etc/passwd",
    "https://usuario:senha@example.com/vaga",
  ])("rejeita URL insegura %s", async (url) => {
    await expect(validatePublicUrl(url, lookupWith(["93.184.216.34"]))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejeita hostname que resolve para rede privada", async () => {
    await expect(
      validatePublicUrl("https://jobs.example.com", lookupWith(["192.168.0.10"])),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("combina metadados, JSON-LD e texto visível e limita o tamanho", () => {
    const content = formatCapturedJobPage({
      finalUrl: "https://example.com/jobs/1",
      title: "Pessoa Engenheira",
      description: "Vaga na Acme",
      jsonLd: '{"@type":"JobPosting","hiringOrganization":{"name":"Acme"}}',
      text: "Requisitos\nTypeScript\n" + "x".repeat(120_000),
    });
    expect(content).toContain("Pessoa Engenheira");
    expect(content).toContain("JobPosting");
    expect(content).toContain("TypeScript");
    expect(content.length).toBe(100_000);
  });
});
