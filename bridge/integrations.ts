export type Provider = "github" | "vercel" | "codacy";

export interface IntegrationStatus {
  provider: Provider;
  connected: boolean;
  source: string;
  checkedAt: string;
}

/**
 * Tokens come from each provider's authorized OAuth/token flow (env vars here).
 * Being on the Wi-Fi never grants access; without a token the provider is "not connected".
 */
const ENV: Record<Provider, string> = {
  github: "GITHUB_TOKEN",
  vercel: "VERCEL_TOKEN",
  codacy: "CODACY_API_TOKEN",
};

export function integrationStatus(env: Record<string, string | undefined> = process.env, now = Date.now): IntegrationStatus[] {
  return (Object.keys(ENV) as Provider[]).map((provider) => ({
    provider,
    connected: Boolean(env[ENV[provider]]),
    source: `${provider}:account-token`,
    checkedAt: new Date(now()).toISOString(),
  }));
}
