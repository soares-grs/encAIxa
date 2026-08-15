import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewStep } from "./App";

const profile = {
  name: "Ana",
  title: "Dev",
  subtitle: "",
  contact: { email: "ana@example.com", phone: "", linkedin: "", github: "", location: "" },
  summary: "Resumo profissional",
  skills: ["TypeScript"],
  experience: [
    {
      title: "Desenvolvedora",
      company: "Acme",
      period: "2024",
      bullets: ["Desenvolveu aplicações web."],
    },
  ],
  education: [],
  languages: [],
};
const analysis = {
  role: "Frontend Engineer",
  company: "Nova Corp",
  requirements: [],
  relevantSkills: ["TypeScript"],
  gaps: ["Experiência com CI/CD não identificada."],
  suggestions: [],
  score: 50,
};

afterEach(() => vi.unstubAllGlobals());

describe("preenchimento de lacunas", () => {
  it("gera uma prévia editável e confirma a nova sugestão", async () => {
    const updatedAnalysis = {
      ...analysis,
      gaps: [],
      suggestions: [
        {
          id: "gap-1",
          type: "bullet" as const,
          target: "experience.0.bullets.append",
          original: "",
          proposed: "Automatizou pipelines de CI/CD com GitHub Actions.",
          reason: "Demonstra experiência real com CI/CD.",
          evidenceRefs: ["Contexto informado pelo usuário"],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canAdd: true,
            proposed: "Criou pipelines de CI/CD com GitHub Actions.",
            reason: "Demonstra experiência real com CI/CD.",
            evidenceRefs: ["Implementei pipelines"],
            missingInfo: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            analysis: updatedAnalysis,
            decisions: [{ suggestionId: "gap-1", accepted: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onGapConfirmed = vi.fn();
    render(
      <ReviewStep
        job={{ id: "job-1", company: "Nova Corp", role: "Frontend Engineer", text: "Vaga" }}
        profile={profile}
        analysis={analysis}
        decisions={{}}
        setDecisions={vi.fn()}
        onGapConfirmed={onGapConfirmed}
        next={vi.fn()}
        busy={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Adicionar ao currículo" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Onde você teve essa experiência?"),
      "0",
    );
    await userEvent.type(
      within(dialog).getByLabelText("O que você realmente fez?"),
      "Implementei pipelines de CI/CD com GitHub Actions nos projetos da equipe.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Gerar prévia" }));
    const preview = await within(dialog).findByLabelText("Revise o texto antes de adicionar");
    await userEvent.clear(preview);
    await userEvent.type(preview, "Automatizou pipelines de CI/CD com GitHub Actions.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao currículo" }));

    await waitFor(() => expect(onGapConfirmed).toHaveBeenCalledOnce());
    expect(onGapConfirmed).toHaveBeenCalledWith(updatedAnalysis, [
      { suggestionId: "gap-1", accepted: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pede mais contexto quando a IA não encontra evidência suficiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            canAdd: false,
            proposed: "",
            reason: "",
            evidenceRefs: [],
            missingInfo: "Explique qual ferramenta de CI/CD você utilizou e em qual projeto.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(
      <ReviewStep
        job={{ id: "job-1", company: "Nova Corp", role: "Frontend Engineer", text: "Vaga" }}
        profile={profile}
        analysis={analysis}
        decisions={{}}
        setDecisions={vi.fn()}
        onGapConfirmed={vi.fn()}
        next={vi.fn()}
        busy={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Adicionar ao currículo" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Onde você teve essa experiência?"),
      "0",
    );
    await userEvent.type(
      within(dialog).getByLabelText("O que você realmente fez?"),
      "Trabalhei com automação durante os projetos internos da equipe.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Gerar prévia" }));

    expect(
      await within(dialog).findByText(
        "Explique qual ferramenta de CI/CD você utilizou e em qual projeto.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Revise o texto antes de adicionar"),
    ).not.toBeInTheDocument();
  });
});
