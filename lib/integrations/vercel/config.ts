import "server-only";

/** Read scopes to enable on the Vercel integration. The console stores these, not the install URL. */
export const VERCEL_READ_SCOPES = ["project", "deployment", "user", "team"] as const;

export const VERCEL_LIMITS = {
  projects: 100,
  deployments: 25,
  projectsPerSync: 8,
  maxSelectedProjects: 20,
  timeoutMs: 15000,
} as const;

export function vercelEnv() {
  const slug = process.env.VERCEL_INTEGRATION_SLUG?.trim(),
    clientId = process.env.VERCEL_INTEGRATION_CLIENT_ID?.trim(),
    clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET?.trim(),
    redirectUri = process.env.VERCEL_INTEGRATION_REDIRECT_URI?.trim();
  if (!slug || !clientId || !clientSecret || !redirectUri)
    throw new Error("Vercel isn't set up on this site yet.");
  if (!/^[a-z0-9-]{1,32}$/.test(slug)) throw new Error("Vercel integration slug is invalid.");
  return {slug, clientId, clientSecret, redirectUri};
}
