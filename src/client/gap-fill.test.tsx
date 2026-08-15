import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    { title: "Desenvolvedora", company: "Acme", period: "2024", bullets: ["Aplicações web."] },
    { title: "Engenheira", company: "Beta", period: "2023", bullets: ["APIs internas."] },
    { title: "Analista", company: "Gamma", period: "2022", bullets: ["Automações."] },
    { title: "Estagiária", company: "Delta", period: "2021", bullets: ["Suporte técnico."] },
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
const props = {
  job: { id: "job-1", company: "Nova Corp", role: "Frontend Engineer", text: "Vaga" },
  profile,
  analysis,
  decisions: {},
  setDecisions: vi.fn(),
  next: vi.fn(),
  busy: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("preenchimento de lacunas", () => {
  it("gera, revisa e confirma bullets para várias experiências", async () => {
    const updatedAnalysis = {
      ...analysis,
      gaps: [],
      suggestions: [
        {
          id: "gap-1",
          type: "bullet" as const,
          target: "experience.0.bullets.append",
          original: "",
          proposed: "Automatizou pipelines na Acme.",
          reason: "Evidência real.",
          evidenceRefs: ["Implementei pipelines na Acme"],
        },
        {
          id: "gap-2",
          type: "bullet" as const,
          target: "experience.1.bullets.append",
          original: "",
          proposed: "Configurou entregas contínuas na Beta.",
          reason: "Evidência real.",
          evidenceRefs: ["Configurei entregas na Beta"],
        },
      ],
    };
    const decisions = [
      { suggestionId: "gap-1", accepted: true },
      { suggestionId: "gap-2", accepted: true },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                experienceIndex: 0,
                canAdd: true,
                proposed: "Automatizou pipelines na Acme.",
                reason: "Evidência real.",
                evidenceRefs: ["Implementei pipelines na Acme"],
                missingInfo: "",
              },
              {
                experienceIndex: 1,
                canAdd: true,
                proposed: "Configurou entregas contínuas na Beta.",
                reason: "Evidência real.",
                evidenceRefs: ["Configurei entregas na Beta"],
                missingInfo: "",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ analysis: updatedAnalysis, decisions }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onGapConfirmed = vi.fn();
    render(<ReviewStep {...props} onGapConfirmed={onGapConfirmed} />);

    await userEvent.click(screen.getByRole("button", { name: "Adicionar ao currículo" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Desenvolvedora/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: /Engenheira/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Descrever experiências" }));
    const contexts = within(dialog).getAllByLabelText("O que você realmente fez?");
    fireEvent.change(contexts[0], {
      target: { value: "Implementei pipelines na Acme com GitHub Actions para os projetos web." },
    });
    fireEvent.change(contexts[1], {
      target: { value: "Configurei entregas na Beta usando automação para as APIs internas." },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Gerar prévias com IA" }));
    const previews = await within(dialog).findAllByLabelText("Bullet para esta experiência");
    fireEvent.change(previews[1], {
      target: { value: "Configurou e manteve entregas contínuas na Beta." },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Adicionar 2 textos" }));

    await waitFor(() => expect(onGapConfirmed).toHaveBeenCalledWith(updatedAnalysis, decisions));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/jobs/job-1/gaps/drafts",
      expect.objectContaining({ method: "POST" }),
    );
    const confirmBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(confirmBody.entries).toHaveLength(2);
    expect(confirmBody.entries[1].proposed).toBe(
      "Configurou e manteve entregas contínuas na Beta.",
    );
  });

  it("limita a seleção a três experiências", async () => {
    render(<ReviewStep {...props} onGapConfirmed={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Adicionar ao currículo" }));
    const dialog = screen.getByRole("dialog");
    for (const name of [/Desenvolvedora/, /Engenheira/, /Analista/])
      await userEvent.click(within(dialog).getByRole("button", { name }));
    expect(within(dialog).getByText("3/3 selecionadas")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Estagiária/ })).toBeDisabled();
  });

  it("bloqueia a confirmação quando uma experiência precisa de mais contexto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                experienceIndex: 0,
                canAdd: false,
                proposed: "",
                reason: "",
                evidenceRefs: [],
                missingInfo: "Explique qual ferramenta de CI/CD foi utilizada.",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<ReviewStep {...props} onGapConfirmed={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Adicionar ao currículo" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Desenvolvedora/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Descrever experiências" }));
    fireEvent.change(within(dialog).getByLabelText("O que você realmente fez?"), {
      target: { value: "Trabalhei com automação durante os projetos internos da equipe." },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Gerar prévias com IA" }));
    expect(
      await within(dialog).findByText("Explique qual ferramenta de CI/CD foi utilizada."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Adicionar 1 texto" })).toBeDisabled();
  });
});
