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
              : url === "/api/jobs" && options?.method === "POST"
                ? {
                    id: "job-1",
                    company: "Acme",
                    role: "Dev",
                    text: "Descrição completa para a vaga",
                  }
                : [];
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
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
      screen.getByLabelText("Ou cole a descrição completa"),
      "Descrição completa para a vaga",
    );
    await userEvent.click(screen.getByRole("button", { name: /Salvar vaga e continuar/ }));
    expect(await screen.findByRole("button", { name: /Claude Anthropic/ })).toBeInTheDocument();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
  });
});
