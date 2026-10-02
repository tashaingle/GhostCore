import {afterEach, describe, expect, it, vi} from "vitest";
import {createVerify, generateKeyPairSync} from "node:crypto";
import {
  appJwt,
  githubAppEnv,
  installUrl,
  manageUrl,
  stateMatches,
  userCanAccessInstallation,
} from "@/lib/integrations/github/app";
import {GitHubAppConnector, GITHUB_APP_LIMITS} from "@/lib/integrations/github/app-connector";
import {GitHubApiError} from "@/lib/integrations/github/api";
import {loadConnector} from "@/lib/integrations/loader";

const {privateKey, publicKey} = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: {type: "pkcs8", format: "pem"},
  publicKeyEncoding: {type: "spki", format: "pem"},
});
const env = {
  GITHUB_APP_ID: "12345",
  GITHUB_APP_SLUG: "ghost-core",
  GITHUB_APP_CLIENT_ID: "Iv1.abc",
  GITHUB_APP_CLIENT_SECRET: "secret",
  GITHUB_APP_PRIVATE_KEY: privateKey,
};

describe("GitHub App configuration", () => {
  it("is off until every setting is present", () => {
    expect(githubAppEnv({...env, GITHUB_APP_PRIVATE_KEY: ""})).toBeNull();
    expect(githubAppEnv(env)?.slug).toBe("ghost-core");
  });

  it("accepts the private key with escaped newlines or base64-encoded", () => {
    const escaped = githubAppEnv({
      ...env,
      GITHUB_APP_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
    });
    const encoded = githubAppEnv({
      ...env,
      GITHUB_APP_PRIVATE_KEY: Buffer.from(privateKey).toString("base64"),
    });
    expect(escaped?.privateKey).toBe(privateKey);
    expect(encoded?.privateKey).toBe(privateKey);
  });
});

describe("GitHub App authentication", () => {
  it("signs a short-lived RS256 JWT GitHub can verify", () => {
    const now = new Date("2026-10-02T12:00:00Z"),
      token = appJwt("12345", privateKey, now),
      [header, payload, signature] = token.split("."),
      claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(claims.iss).toBe("12345");
    // Back-dated for clock drift, and under GitHub's ten-minute maximum.
    expect(claims.iat).toBe(now.getTime() / 1000 - 60);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it("only accepts installations the signed-in GitHub user can access", async () => {
    const request = (async () =>
      new Response(JSON.stringify({installations: [{id: 111}, {id: 222}]}))) as typeof fetch;
    expect(await userCanAccessInstallation("user-token", "222", request)).toBe(true);
    expect(await userCanAccessInstallation("user-token", "999", request)).toBe(false);
  });

  it("validates state in constant time and builds GitHub links", () => {
    expect(stateMatches("abc", "abc")).toBe(true);
    expect(stateMatches("abc", "abd")).toBe(false);
    expect(stateMatches(undefined, "abc")).toBe(false);
    expect(installUrl("ghost-core", "s t")).toBe(
      "https://github.com/apps/ghost-core/installations/new?state=s%20t",
    );
    expect(manageUrl("User", "tashaingle", "7")).toBe(
      "https://github.com/settings/installations/7",
    );
    expect(manageUrl("Organization", "acme", "7")).toBe(
      "https://github.com/organizations/acme/settings/installations/7",
    );
  });
});

describe("GitHub App connector", () => {
  const push = (repo: string) => ({
    id: `${repo}-1`,
    type: "PushEvent",
    created_at: "2026-10-02T10:00:00Z",
    repo: {name: repo},
    actor: {login: "tasha"},
    payload: {ref: "refs/heads/main", commits: [{}]},
  });

  it("only reads the repositories in the installation", async () => {
    const read: string[] = [];
    const connector = new GitHubAppConnector(async () => ({
      installationRepositories: async () => ["acme/shop", "acme/site"],
      repositoryActivity: async (repo: string) => {
        read.push(repo);
        return [push(repo)];
      },
      workflowRuns: async () => [],
    }));
    const result = await connector.sync({organisationId: "o", integrationId: "i"});
    expect(read).toEqual(["acme/shop", "acme/site"]);
    expect(result.events.map((e) => e.metadata?.repository ?? e.title)).toHaveLength(2);
  });

  it("caps repositories per sync and skips one unreadable repository", async () => {
    const repos = Array.from({length: 30}, (_, i) => `acme/r${i}`);
    const connector = new GitHubAppConnector(async () => ({
      installationRepositories: async () => repos,
      repositoryActivity: async (repo: string) => {
        if (repo === "acme/r1") throw new GitHubApiError("api", "gone");
        return [push(repo)];
      },
      workflowRuns: async (list: string[]) => {
        expect(list).toHaveLength(GITHUB_APP_LIMITS.workflowRepositories);
        return [];
      },
    }));
    const result = await connector.sync({organisationId: "o", integrationId: "i"});
    expect(result.received).toBe(GITHUB_APP_LIMITS.repositories - 1);
  });

  it("reports a removed installation as expired so the user reconnects", async () => {
    const connector = new GitHubAppConnector(async () => {
      throw new GitHubApiError("unauthorized", "removed");
    });
    expect(await connector.healthCheck()).toBe("expired");
  });
});

describe("connector selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the GitHub App for installations and OAuth for older connections", () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    expect(loadConnector("github", {settings: {installationId: "7"}})).toBeInstanceOf(
      GitHubAppConnector,
    );
    expect(loadConnector("github", {accessToken: "gho_x"})).not.toBeInstanceOf(GitHubAppConnector);
  });
});
