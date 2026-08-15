import type { GapDraft, Optimization, Profile, ProfileDraft } from "../../shared/schemas.js";

export type ProviderId = "codex" | "claude";
export type ProviderStatus = {
  installed: boolean;
  authenticated: boolean;
  version: string;
  loginRunning: boolean;
  loginOutput: string;
  error?: string;
};
export type ProviderActivity =
  "session_started" | "response_in_progress" | "response_refined" | "result_received";
export type ProviderActivityReporter = (activity: ProviderActivity) => void;
export type GapFillInput = {
  gap: string;
  context: string;
  experience: Profile["experience"][number];
};

export interface AiProvider {
  id: ProviderId;
  label: string;
  status(): Promise<ProviderStatus>;
  startLogin(): void;
  optimize(
    profile: Profile,
    job: { company: string; role: string; text: string },
    report?: ProviderActivityReporter,
  ): Promise<Optimization>;
  translateProfile(profile: Profile): Promise<Profile>;
  extractProfile(resumeText: string): Promise<ProfileDraft>;
  fillGap(input: GapFillInput): Promise<GapDraft>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: 400 | 409 | 502 | 504,
  ) {
    super(message);
  }
}
