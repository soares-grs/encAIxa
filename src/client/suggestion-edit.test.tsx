import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewStep } from "./App";

const profile = {
  name: "Ana",
  title: "Dev",
  subtitle: "",
  contact: { email: "", phone: "", linkedin: "", github: "", location: "" },
  summary: "Resumo original",
  skills: ["TypeScript"],
  experience: [],
  education: [],
  languages: [],
};
const analysis = {
  role: "Dev",
  company: "Acme",
  requirements: [],
  relevantSkills: ["TypeScript"],
  gaps: [],
  suggestions: [
    {
      id: "s1",
      type: "summary" as const,
      target: "summary",
      original: "Resumo original",
      proposed: "Resumo sugerido pela IA",
      reason: "Maior aderência.",
      evidenceRefs: ["summary"],
    },
  ],
  score: 80,
};
const baseProps = {
  job: { id: "job-1", company: "Acme", role: "Dev", text: "Descrição da vaga" },
  profile,
  analysis,
  onGapConfirmed: vi.fn(),
  next: vi.fn(),
  busy: false,
};

describe("edição de sugestões", () => {
  it("atualiza a aderência ao aplicar uma sugestão", () => {
    render(
      <ReviewStep
        {...baseProps}
        workflow={{
          version: 1,
          step: 3,
          provider: "codex",
          languages: ["ptbr"],
          files: [],
          updatedAt: "2026-01-01",
          reviewBaseline: { score: 0, initialGapCount: 0, suggestionIds: ["s1"] },
        }}
        decisions={{ s1: { accepted: true } }}
        setDecision={vi.fn()}
      />,
    );
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("+10 desde a análise")).toBeInTheDocument();
  });

  it("edita inline e aplica o texto personalizado como aceito", async () => {
    const setDecision = vi.fn(async () => true);
    render(
      <ReviewStep
        {...baseProps}
        decisions={{ s1: { accepted: false } }}
        setDecision={setDecision}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const editor = screen.getByLabelText("Editar sugestão s1");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Resumo ajustado pela pessoa usuária");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar edição" }));
    expect(setDecision).toHaveBeenCalledWith("s1", true, "Resumo ajustado pela pessoa usuária");
    expect(screen.queryByLabelText("Editar sugestão s1")).not.toBeInTheDocument();
  });

  it("preserva a edição ao rejeitar ou aceitar e permite restaurar a IA", async () => {
    const setDecision = vi.fn(async () => true);
    render(
      <ReviewStep
        {...baseProps}
        decisions={{ s1: { accepted: true, customText: "Resumo personalizado" } }}
        setDecision={setDecision}
      />,
    );
    expect(screen.getByText("Resumo personalizado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    await userEvent.click(screen.getByRole("button", { name: "Restaurar sugestão da IA" }));
    expect(setDecision).toHaveBeenNthCalledWith(1, "s1", false, undefined);
    expect(setDecision).toHaveBeenNthCalledWith(2, "s1", true, undefined);
    expect(setDecision).toHaveBeenNthCalledWith(3, "s1", true, null);
  });
});
