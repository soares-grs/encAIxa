import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerateStep } from "./App";

const job = {
  id: "job-1",
  company: "Acme",
  role: "Frontend Engineer",
  text: "Descrição completa da vaga para análise.",
  provider: "codex" as const,
};

function renderStep(files: Array<{ name: string; url: string; pages: number; lang: string }> = []) {
  const startAnotherJob = vi.fn();
  const updateProfile = vi.fn();
  render(
    <GenerateStep
      job={job}
      langs={["ptbr"]}
      setLangs={vi.fn()}
      generate={vi.fn()}
      files={files}
      busy={false}
      startAnotherJob={startAnotherJob}
      updateProfile={updateProfile}
    />,
  );
  return { startAnotherJob, updateProfile };
}

describe("GenerateStep", () => {
  it("não antecipa o próximo fluxo antes de gerar os arquivos", () => {
    renderStep();

    expect(screen.queryByText("Candidatura pronta para enviar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Analisar outra vaga/ })).not.toBeInTheDocument();
  });

  it("mantém o download e oferece os dois caminhos para a próxima candidatura", async () => {
    const actions = renderStep([
      { name: "curriculo-acme.pdf", url: "/output/curriculo-acme.pdf", pages: 2, lang: "ptbr" },
    ]);

    expect(screen.getByRole("link", { name: "Baixar curriculo-acme.pdf" })).toHaveAttribute(
      "href",
      "/output/curriculo-acme.pdf",
    );
    expect(screen.getByText("Candidatura pronta para enviar")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Analisar outra vaga/ }));
    await userEvent.click(screen.getByRole("button", { name: /Atualizar meu perfil/ }));
    expect(actions.startAnotherJob).toHaveBeenCalledOnce();
    expect(actions.updateProfile).toHaveBeenCalledOnce();
  });
});
