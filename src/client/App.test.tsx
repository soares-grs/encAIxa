import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ThemeProvider } from "./theme";

const profile = {
  name: "Ana",
  title: "Dev",
  subtitle: "",
  contact: { email: "ana@example.com", phone: "", linkedin: "", github: "", location: "" },
  summary: "Resumo",
  skills: ["TypeScript"],
  experience: [],
  education: [],
  languages: [],
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const data =
        url === "/api/profile"
          ? profile
          : url === "/api/onboarding"
            ? {
                completed: true,
                version: 1,
                mode: null,
                step: 0,
                provider: "codex",
                profile,
                updatedAt: null,
                completedAt: "2026-01-01",
              }
            : url === "/api/providers/status"
              ? {
                  codex: {
                    installed: true,
                    authenticated: true,
                    version: "1.0",
                    loginRunning: false,
                    loginOutput: "",
                  },
                  claude: {
                    installed: true,
                    authenticated: false,
                    version: "2.0",
                    loginRunning: false,
                    loginOutput: "",
                  },
                }
              : url === "/api/jobs/extract/stream"
                ? [
                    {
                      type: "progress",
                      stage: "extracting",
                      progress: 52,
                      title: "Extraindo",
                      message: "Identificando a vaga",
                    },
                    {
                      type: "complete",
                      data: {
                        sourceUrl: "https://jobs.example.com/dev",
                        provider: "codex",
                        company: "Acme",
                        role: "Dev",
                        text: "Descrição completa capturada da oportunidade",
                      },
                    },
                  ]
                    .map((event) => JSON.stringify(event))
                    .join("\n") + "\n"
                : url === "/api/jobs" && options?.method === "POST"
                  ? {
                      id: "job-1",
                      company: "Acme",
                      role: "Dev",
                      text: "Descrição completa para a vaga",
                    }
                  : [];
      return Promise.resolve(
        new Response(url === "/api/jobs/extract/stream" ? String(data) : JSON.stringify(data), {
          status: 200,
          headers: {
            "Content-Type":
              url === "/api/jobs/extract/stream" ? "application/x-ndjson" : "application/json",
          },
        }),
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("carrega o perfil e bloqueia etapas futuras", async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    expect(await screen.findByDisplayValue("Ana")).toBeInTheDocument();
    const vaga = screen.getAllByRole("button", { name: /Vaga/ })[0];
    expect(vaga).toBeDisabled();
  });
  it("salva o perfil e avança para a vaga", async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByDisplayValue("Ana");
    await userEvent.click(screen.getByRole("button", { name: /Salvar e continuar/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Descrição da vaga" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Salvar vaga e continuar/ })).toBeDisabled();
  });
  it("mostra os provedores disponíveis na análise", async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByDisplayValue("Ana");
    await userEvent.click(screen.getByRole("button", { name: /Salvar e continuar/ }));
    await userEvent.type(screen.getByLabelText("Empresa"), "Acme");
    await userEvent.type(screen.getByLabelText("Cargo"), "Dev");
    await userEvent.type(
      screen.getByLabelText("Descrição completa da vaga"),
      "Descrição completa para a vaga",
    );
    await userEvent.click(screen.getByRole("button", { name: /Salvar vaga e continuar/ }));
    expect(await screen.findByRole("button", { name: /Claude Anthropic/ })).toBeInTheDocument();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
  });
  it("captura uma vaga pública pelo link e mantém os campos para revisão", async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByDisplayValue("Ana");
    await userEvent.click(screen.getByRole("button", { name: /Salvar e continuar/ }));
    await userEvent.type(screen.getByLabelText("Link da vaga"), "https://jobs.example.com/dev");
    await userEvent.click(screen.getByRole("button", { name: "Capturar dados" }));
    expect(await screen.findByDisplayValue("Acme")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dev")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Descrição completa capturada da oportunidade"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar vaga e continuar/ })).toBeEnabled();
  });
  it("restaura a etapa, idiomas e arquivos de uma candidatura do histórico", async () => {
    const baseFetch = fetch as ReturnType<typeof vi.fn>;
    baseFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const workflow = {
        version: 1,
        step: 4,
        provider: "claude",
        languages: ["ptbr", "en"],
        files: [
          {
            name: "encaixa-en.pdf",
            url: "/api/jobs/job-1/download/encaixa-en.pdf",
            pages: 2,
            lang: "en",
          },
        ],
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      const data =
        url === "/api/profile"
          ? profile
          : url === "/api/onboarding"
            ? { completed: true, profile, completedAt: "2026-01-01" }
            : url === "/api/providers/status"
              ? {
                  codex: { ...emptyStatus, authenticated: true },
                  claude: { ...emptyStatus, authenticated: true },
                }
              : url === "/api/jobs/job-1"
                ? {
                    id: "job-1",
                    company: "Acme",
                    role: "Dev",
                    text: "Descrição completa para a vaga",
                    workflow,
                    analysis: null,
                    decisions: [],
                    files: workflow.files,
                    profileSnapshot: profile,
                  }
                : [{ id: "job-1", company: "Acme", role: "Dev", text: "Vaga", workflow }];
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    const historyRole = await screen.findByText("Dev");
    await userEvent.click(historyRole.closest("button")!);
    expect(await screen.findByRole("heading", { name: "Prévia e arquivos finais" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Baixar encaixa-en.pdf" })).toHaveAttribute(
      "href",
      "/api/jobs/job-1/download/encaixa-en.pdf",
    );
    expect(screen.getByLabelText("Inglês")).toBeChecked();
  });
});

const emptyStatus = {
  installed: true,
  authenticated: false,
  loginRunning: false,
  loginOutput: "",
  version: "1.0",
};
