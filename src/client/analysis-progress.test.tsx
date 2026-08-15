import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalysisProgressCard, type AnalysisRun } from "./App";

const job = {
  id: "job-1",
  company: "Acme",
  role: "Frontend Engineer",
  text: "Descrição completa da vaga para análise.",
};

function run(error?: string): AnalysisRun {
  return {
    startedAt: Date.now() - 4_000,
    lastHeartbeatAt: Date.now(),
    activities: [
      {
        type: "activity",
        stage: "analyzing",
        message: "Claude está estruturando a análise.",
        timestamp: new Date().toISOString(),
      },
    ],
    error,
    event: {
      type: "progress",
      stage: error ? "checking_provider" : "analyzing",
      progress: error ? 18 : 36,
      title: "Analisando seu encaixe",
      message: "Comparando suas evidências com os requisitos da vaga.",
    },
  };
}

describe("AnalysisProgressCard", () => {
  it("apresenta etapa real, contexto da vaga e feedback útil", () => {
    render(
      <AnalysisProgressCard
        run={run()}
        provider="Codex"
        job={job}
        retry={vi.fn()}
        changeProvider={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Analisando seu encaixe" })).toBeInTheDocument();
    expect(screen.getByText(/Frontend Engineer/)).toHaveTextContent("Frontend Engineer · Acme");
    expect(screen.getByRole("progressbar", { name: "Progresso da análise" })).toHaveAttribute(
      "aria-valuenow",
      "36",
    );
    expect(screen.getByText(/cruzando suas experiências/)).toBeInTheDocument();
    expect(screen.getByText("Atividade em tempo real")).toBeInTheDocument();
    expect(screen.getByText("Claude está estruturando a análise.")).toBeInTheDocument();
  });

  it("oferece recuperação quando a análise falha", async () => {
    const retry = vi.fn();
    const changeProvider = vi.fn();
    render(
      <AnalysisProgressCard
        run={run("Claude não está autenticado.")}
        provider="Claude"
        job={job}
        retry={retry}
        changeProvider={changeProvider}
      />,
    );

    expect(screen.getByText("Claude não está autenticado.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    await userEvent.click(screen.getByRole("button", { name: /Trocar provedor/ }));
    expect(retry).toHaveBeenCalledOnce();
    expect(changeProvider).toHaveBeenCalledOnce();
  });

  it("avisa quando os heartbeats do servidor ficam atrasados", () => {
    const staleRun = run();
    staleRun.lastHeartbeatAt = Date.now() - 13_000;
    render(
      <AnalysisProgressCard
        run={staleRun}
        provider="Claude"
        job={job}
        retry={vi.fn()}
        changeProvider={vi.fn()}
      />,
    );

    expect(screen.getByText("Conexão lenta, aguardando o provedor")).toBeInTheDocument();
  });
});
