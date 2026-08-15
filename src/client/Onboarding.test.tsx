import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Onboarding, { type OnboardingState } from "./Onboarding";

const emptyProfile = {
  name: "",
  title: "",
  subtitle: "",
  contact: { email: "", phone: "", linkedin: "", github: "", location: "" },
  summary: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
};
const initial: OnboardingState = {
  completed: false,
  version: 1,
  mode: null,
  step: 0,
  provider: "codex",
  profile: emptyProfile,
  updatedAt: null,
  completedAt: null,
};
const statuses = {
  codex: {
    installed: true,
    authenticated: true,
    version: "1",
    loginRunning: false,
    loginOutput: "",
  },
  claude: {
    installed: false,
    authenticated: false,
    version: "",
    loginRunning: false,
    loginOutput: "",
  },
};
const importedProfile = { ...emptyProfile, name: "Ana", title: "Dev", summary: "Resumo" };
const importStreamResponse = (provider: "codex" | "claude" = "codex") =>
  new Response(
    [
      JSON.stringify({
        type: "progress",
        stage: "validating",
        progress: 84,
        title: "Conferindo os dados",
        message: "Validando o perfil.",
      }),
      JSON.stringify({ type: "complete", data: { profile: importedProfile, provider } }),
    ].join("\n"),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
afterEach(() => vi.unstubAllGlobals());

describe("Onboarding", () => {
  it("oferece preenchimento e importação nos formatos suportados", () => {
    render(
      <Onboarding
        initial={initial}
        statuses={statuses}
        refreshStatuses={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Preencher meu perfil/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Importar meu currículo/ })).toBeInTheDocument();
  });
  it("aceita JSON sem exigir um provedor conectado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(importStreamResponse())),
    );
    render(
      <Onboarding
        initial={initial}
        statuses={{ ...statuses, codex: { ...statuses.codex, authenticated: false } }}
        refreshStatuses={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Importar meu currículo/ }));
    const file = new File([JSON.stringify(emptyProfile)], "perfil.json", {
      type: "application/json",
    });
    await userEvent.upload(screen.getByLabelText(/Selecione ou arraste/), file);
    expect(await screen.findByText("Tudo pronto para revisar")).toBeInTheDocument();
  });
  it("usa o Claude conectado quando o Codex não está instalado", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _options?: RequestInit) =>
      Promise.resolve(importStreamResponse("claude")),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Onboarding
        initial={initial}
        statuses={{
          codex: { ...statuses.codex, installed: false, authenticated: false },
          claude: { ...statuses.claude, installed: true, authenticated: true },
        }}
        refreshStatuses={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Importar meu currículo/ }));
    await userEvent.upload(
      screen.getByLabelText(/Selecione ou arraste/),
      new File(["currículo de exemplo"], "perfil.txt", { type: "text/plain" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get("provider")).toBe("claude");
  });
  it("mostra o progresso recebido enquanto a IA estrutura o perfil", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode(
                    `${JSON.stringify({ type: "progress", stage: "extracting", progress: 38, title: "Claude está organizando seu perfil", message: "Identificando experiências." })}\n`,
                  ),
                );
                setTimeout(() => {
                  controller.enqueue(
                    encoder.encode(
                      `${JSON.stringify({ type: "complete", data: { profile: importedProfile, provider: "claude" } })}\n`,
                    ),
                  );
                  controller.close();
                }, 100);
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <Onboarding
        initial={initial}
        statuses={{
          codex: { ...statuses.codex, installed: false, authenticated: false },
          claude: { ...statuses.claude, installed: true, authenticated: true },
        }}
        refreshStatuses={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Importar meu currículo/ }));
    await userEvent.upload(
      screen.getByLabelText(/Selecione ou arraste/),
      new File(["currículo"], "perfil.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("Claude está organizando seu perfil")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Progresso da importação" })).toBeVisible();
  });
});
