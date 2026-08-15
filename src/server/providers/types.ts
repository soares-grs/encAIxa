import type { Optimization, Profile, ProfileDraft } from "../../shared/schemas.js";

export type ProviderId = "codex" | "claude";
export type ProviderStatus = {
  installed: boolean;
  authenticated: boolean;
  version: string;
  loginRunning: boolean;
  loginOutput: string;
  error?: string;
};

export interface AiProvider {
  id: ProviderId;
  label: string;
  status(): Promise<ProviderStatus>;
  startLogin(): void;
  optimize(
    profile: Profile,
    job: { company: string; role: string; text: string },
  ): Promise<Optimization>;
  translateProfile(profile: Profile): Promise<Profile>;
  extractProfile(resumeText: string): Promise<ProfileDraft>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: 400 | 409 | 502 | 504,
  ) {
    super(message);
  }
}
