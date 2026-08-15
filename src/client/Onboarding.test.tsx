import { render, screen } from "@testing-library/react";
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
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              profile: { ...emptyProfile, name: "Ana", title: "Dev", summary: "Resumo" },
              provider: "codex",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
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
});
