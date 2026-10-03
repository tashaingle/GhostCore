import {beforeEach, describe, expect, it, vi} from "vitest";
import {vercelInstallUrl, vercelStateMatches} from "@/lib/integrations/vercel/oauth";
import {VercelClient, VercelError} from "@/lib/integrations/vercel/client";
import {VercelConnector} from "@/lib/integrations/vercel/connector";
import {translateVercelDeployment} from "@/lib/integrations/vercel/translator";
import {loadConnector} from "@/lib/integrations/loader";
import type {VercelDeployment} from "@/lib/integrations/vercel/types";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-03T00:00:00Z",
};
const ready: VercelDeployment = {
  id: "dpl_ok",
  projectId: "prj_1",
  projectName: "web",
  url: "web.vercel.app",
  createdMs: 1_700_000_000_000,
  state: "READY",
  target: "production",
  branch: "main",
};

beforeEach(() => {
  process.env.VERCEL_INTEGRATION_SLUG = "metric-mage";
  process.env.VERCEL_INTEGRATION_CLIENT_ID = "oac_test";
  process.env.VERCEL_INTEGRATION_CLIENT_SECRET = "super-secret";
  process.env.VERCEL_INTEGRATION_REDIRECT_URI =
    "http://localhost:3000/api/integrations/vercel/callback";
});

describe("Vercel connection", () => {
  it("sends the user to the integration install URL without the client secret", () => {
    const url = vercelInstallUrl("state.one");
    expect(url).toBe("https://vercel.com/integrations/metric-mage/new?state=state.one");
    expect(url).not.toContain("super-secret");
    expect(vercelStateMatches("same", "same")).toBe(true);
    expect(vercelStateMatches("same", "bad")).toBe(false);
  });

  it("keeps the token out of the request URL and treats 401 as expired access", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).not.toContain("secret-token");
      expect(String(url)).toContain("teamId=team_1");
      return new Response(JSON.stringify({error: {code: "forbidden", message: "no"}}), {
        status: 401,
      });
    });
    const client = new VercelClient("secret-token", request as typeof fetch);
    await expect(client.projects("team_1", 1)).rejects.toMatchObject({
      kind: "unauthorized",
    } as VercelError);
  });

  it("turns finished deploys into read-only events and drops build logs", () => {
    expect(translateVercelDeployment(ready, context)).toMatchObject({
      source: "vercel",
      eventType: "vercel.deployment.ready",
      severity: "good",
      externalId: "vercel:dpl_ok",
      metadata: {url: "https://web.vercel.app", branch: "main", target: "production"},
      rawPayload: {},
    });
    expect(
      translateVercelDeployment({...ready, id: "dpl_bad", state: "ERROR"}, context)?.severity,
    ).toBe("critical");
    expect(
      translateVercelDeployment({...ready, id: "dpl_preview", target: null}, context)?.severity,
    ).toBe("info");
    expect(translateVercelDeployment({...ready, state: "BUILDING"}, context)).toBeNull();
    expect(JSON.stringify(translateVercelDeployment(ready, context))).not.toContain(
      "commit message",
    );
  });

  it("imports terminal deploys for the chosen projects and skips ones still building", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      expect(href).not.toContain("secret-token");
      expect(href).toContain("projectId=prj_1");
      return new Response(
        JSON.stringify({
          deployments: [
            {
              uid: "dpl_ok",
              name: "web",
              url: "web.vercel.app",
              created: ready.createdMs,
              readyState: "READY",
              target: "production",
              projectId: "prj_1",
              meta: {githubCommitRef: "main", githubCommitMessage: "do not store this"},
            },
            {
              uid: "dpl_bad",
              name: "web",
              created: ready.createdMs + 1000,
              readyState: "ERROR",
              target: "production",
              projectId: "prj_1",
            },
            {
              uid: "dpl_build",
              name: "web",
              created: ready.createdMs + 2000,
              state: "BUILDING",
              projectId: "prj_1",
            },
          ],
        }),
        {status: 200},
      );
    });
    const connector = new VercelConnector(
      new VercelClient("secret-token", request as typeof fetch),
      {
        teamId: "team_1",
        selectedProjectIds: ["prj_1"],
        configurationStatus: "ready",
      },
    );
    const result = await connector.sync(context);
    expect(result.received).toBe(3);
    expect(result.events.map((event) => event.eventType)).toEqual([
      "vercel.deployment.ready",
      "vercel.deployment.failed",
    ]);
    expect(JSON.stringify(result.events)).not.toContain("do not store this");
    expect(result.settings).toMatchObject({rotationIndex: 0, selectedProjectIds: ["prj_1"]});
  });

  it("refuses to sync until a project is chosen", async () => {
    const connector = new VercelConnector(new VercelClient("secret-token"), {
      selectedProjectIds: [],
    });
    await expect(connector.sync(context)).rejects.toMatchObject({kind: "configuration"});
  });

  it("loads from the registry only when a token is present", () => {
    expect(
      loadConnector("vercel", {accessToken: "token", settings: {selectedProjectIds: ["prj_1"]}})
        .provider,
    ).toBe("vercel");
    expect(() => loadConnector("vercel")).toThrow(/Vercel credentials/);
  });
});
