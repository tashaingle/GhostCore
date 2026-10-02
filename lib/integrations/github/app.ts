import "server-only";
import {createPrivateKey, createSign, randomBytes, timingSafeEqual} from "node:crypto";
import {GitHubApiError} from "./api";

export type GitHubAppEnv = {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
};

/**
 * The GitHub App is configured only when all of its settings are present; until then Ghost keeps
 * using the older OAuth connection. The private key may be stored with literal "\n" escapes or
 * base64-encoded, as hosting dashboards often mangle multi-line values.
 */
export function githubAppEnv(env: Record<string, string | undefined> = process.env) {
  const appId = env.GITHUB_APP_ID?.trim(),
    slug = env.GITHUB_APP_SLUG?.trim(),
    clientId = env.GITHUB_APP_CLIENT_ID?.trim(),
    clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim(),
    rawKey = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !slug || !clientId || !clientSecret || !rawKey) return null;
  const privateKey = rawKey.includes("BEGIN")
    ? rawKey.replace(/\\n/g, "\n")
    : Buffer.from(rawKey, "base64").toString("utf8");
  return {appId, slug, clientId, clientSecret, privateKey} satisfies GitHubAppEnv;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** A short-lived JWT proving requests come from the Ghost Core GitHub App (RS256). */
export function appJwt(appId: string, privateKey: string, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000) - 60, // allow for clock drift
    header = base64url(JSON.stringify({alg: "RS256", typ: "JWT"})),
    payload = base64url(JSON.stringify({iat, exp: iat + 9 * 60, iss: appId})),
    signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(createPrivateKey(privateKey)).toString("base64url")}`;
}

const API = "https://api.github.com";
const headers = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "Ghost-Core",
});

async function call<T>(request: typeof fetch, url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await request(url, init);
  } catch {
    throw new GitHubApiError("network", "GitHub could not be reached. Try again shortly.");
  }
  if (response.status === 401 || response.status === 404)
    throw new GitHubApiError(
      "unauthorized",
      "The GitHub App is no longer installed or its access was removed. Reconnect GitHub.",
    );
  if (!response.ok)
    throw new GitHubApiError("api", `GitHub returned an unexpected response (${response.status}).`);
  return (await response.json()) as T;
}

/** A one-hour token limited to the repositories the user chose when installing the app. */
export async function installationToken(
  env: GitHubAppEnv,
  installationId: string,
  request: typeof fetch = fetch,
) {
  const result = await call<{token: string; expires_at: string}>(
    request,
    `${API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {method: "POST", headers: headers(appJwt(env.appId, env.privateKey))},
  );
  return result.token;
}

export type GitHubInstallation = {
  id: number;
  account: {login: string; type: string} | null;
  repository_selection: "all" | "selected";
  html_url?: string;
};

export function installation(env: GitHubAppEnv, id: string, request: typeof fetch = fetch) {
  return call<GitHubInstallation>(request, `${API}/app/installations/${encodeURIComponent(id)}`, {
    headers: headers(appJwt(env.appId, env.privateKey)),
  });
}

/** Exchanges the code GitHub returns after installation for a user token (used only to verify). */
export async function exchangeUserCode(
  env: GitHubAppEnv,
  code: string,
  redirectUri: string,
  request: typeof fetch = fetch,
) {
  const result = await call<{access_token?: string; error?: string}>(
    request,
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {Accept: "application/json", "Content-Type": "application/json"},
      body: JSON.stringify({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    },
  );
  if (!result.access_token)
    throw new GitHubApiError("unauthorized", "GitHub did not confirm the installation. Try again.");
  return result.access_token;
}

/**
 * Confirms the installation is one the signed-in GitHub user can access, so nobody can attach
 * someone else's installation to their organisation by editing the callback URL.
 */
export async function userCanAccessInstallation(
  userToken: string,
  installationId: string,
  request: typeof fetch = fetch,
) {
  const result = await call<{installations: {id: number}[]}>(
    request,
    `${API}/user/installations?per_page=100`,
    {headers: headers(userToken)},
  );
  return result.installations.some((i) => String(i.id) === installationId);
}

export const installUrl = (slug: string, state: string) =>
  `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;

/** Where the user changes which repositories the app can see. */
export const manageUrl = (
  accountType: string | undefined,
  login: string | undefined,
  id: string,
) =>
  accountType === "Organization" && login
    ? `https://github.com/organizations/${encodeURIComponent(login)}/settings/installations/${encodeURIComponent(id)}`
    : `https://github.com/settings/installations/${encodeURIComponent(id)}`;

/** Cookie binding a GitHub App install to the organisation and user that started it. */
export const GITHUB_APP_COOKIE = "ghost_github_app";

export const newState = () => randomBytes(24).toString("base64url");
export function stateMatches(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected),
    b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
