import { expect, test, type Page } from "@playwright/test";

const profile = {
  name: "Ana Silva",
  title: "Desenvolvedora",
  subtitle: "",
  contact: { email: "ana@example.com", phone: "", linkedin: "", github: "", location: "" },
  summary: "Resumo profissional",
  skills: ["TypeScript"],
  experience: [],
  education: [],
  languages: [],
};

async function mockLocalApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data =
      pathname === "/api/onboarding"
        ? { completed: true, profile, completedAt: "2026-01-01T00:00:00.000Z" }
        : pathname === "/api/profile"
          ? profile
          : pathname === "/api/providers/status"
            ? {
                codex: {
                  installed: true,
                  authenticated: true,
                  version: "test",
                  loginRunning: false,
                  loginOutput: "",
                },
                claude: {
                  installed: true,
                  authenticated: false,
                  version: "test",
                  loginRunning: false,
                  loginOutput: "",
                },
              }
            : [];
    await route.fulfill({ json: data });
  });
}

test("carrega a aplicação e permite interação básica", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await mockLocalApi(page);
  await page.goto("/");

  await expect(page).toHaveTitle("encAIxa");
  await page.waitForTimeout(500);
  expect(runtimeErrors, await page.locator("body").innerText()).toEqual([]);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana Silva");
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: /Salvar e continuar/ }).click();
  await expect(page.getByRole("heading", { name: "Descrição da vaga" })).toBeVisible();
});
