import { describe, expect, it } from "vitest";
import { resumeFilename, safeFilenamePart } from "./filename.js";

describe("nomes de currículo", () => {
  it("combina candidato, cargo e empresa sem acentos", () => {
    expect(
      resumeFilename(
        "Gabriel Ribeiro Soares",
        "Engenheiro de Software Sênior",
        "Ação & Tecnologia",
        "ptbr",
      ),
    ).toBe("Gabriel_Ribeiro_Soares_Curriculo_Engenheiro_de_Software_Senior_Acao_Tecnologia.pdf");
  });

  it("identifica somente a versão em inglês", () => {
    expect(resumeFilename("Ana Lima", "Developer", "Acme", "en")).toBe(
      "Ana_Lima_Curriculo_Developer_Acme_EN.pdf",
    );
    expect(resumeFilename("Ana Lima", "Developer", "Acme", "ptbr")).not.toContain("_EN.pdf");
  });

  it("remove caracteres inseguros, aplica fallbacks e limita o tamanho", () => {
    expect(safeFilenamePart("../../Cargo | Especial", "Cargo", 30)).toBe("Cargo_Especial");
    expect(resumeFilename("", "", "", "ptbr")).toBe("Candidato_Curriculo_Cargo_Empresa.pdf");
    expect(
      resumeFilename("N".repeat(100), "R".repeat(100), "E".repeat(100), "en").length,
    ).toBeLessThanOrEqual(110);
  });
});
