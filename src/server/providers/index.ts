import { codexStatus, optimize, startLogin, translateProfile } from "../codex.js";
import { claudeProvider } from "./claude.js";
import { ProviderError, type AiProvider, type ProviderId } from "./types.js";

const codexProvider: AiProvider = {
  id: "codex",
  label: "Codex",
  status: codexStatus,
  startLogin,
  optimize,
  translateProfile,
};
const providers: Record<ProviderId, AiProvider> = { codex: codexProvider, claude: claudeProvider };

export function isProviderId(value: unknown): value is ProviderId {
  return value === "codex" || value === "claude";
}
export function getProvider(value: unknown): AiProvider {
  if (!isProviderId(value)) throw new ProviderError("Provedor de IA inválido.", 400);
  return providers[value];
}
export async function providerStatuses() {
  const [codex, claude] = await Promise.all([providers.codex.status(), providers.claude.status()]);
  return { codex, claude };
}
export async function requireReady(provider: AiProvider) {
  const status = await provider.status();
  if (!status.installed) throw new ProviderError(`${provider.label} CLI não está instalado.`, 409);
  if (status.loginRunning)
    throw new ProviderError(`O login do ${provider.label} ainda está em andamento.`, 409);
  if (!status.authenticated)
    throw new ProviderError(`Faça login no ${provider.label} antes de continuar.`, 409);
  return provider;
}
export async function executeProvider<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error ? error.message : "O provedor retornou uma resposta inválida.",
      502,
    );
  }
}

export type { ProviderId, ProviderStatus } from "./types.js";
