import {describe, expect, it, vi, beforeEach} from "vitest";
import {linkedinId, linkedinUrn, restliList, restliQuery} from "@/lib/integrations/linkedin/urn";
import {LINKEDIN_DEFAULT_VERSION, LINKEDIN_SCOPES} from "@/lib/integrations/linkedin/config";
import {LinkedInClient, LinkedInError} from "@/lib/integrations/linkedin/client";
import {LinkedInConnector} from "@/lib/integrations/linkedin/connector";
import {translateLinkedIn} from "@/lib/integrations/linkedin/translator";
beforeEach(() => {
  process.env.LINKEDIN_CLIENT_ID = "client";
  process.env.LINKEDIN_CLIENT_SECRET = "secret";
  process.env.LINKEDIN_REDIRECT_URI = "http://localhost:3000/api/integrations/linkedin/callback";
  process.env.LINKEDIN_API_VERSION = LINKEDIN_DEFAULT_VERSION;
});
/* eslint-disable @typescript-eslint/no-unused-vars */
describe("LinkedIn connector", () => {
  it("uses the documented version and read-only scopes", () => {
    expect(LINKEDIN_DEFAULT_VERSION).toBe("202607");
    expect(LINKEDIN_SCOPES).not.toContain("rw_ads");
    expect(LINKEDIN_SCOPES).not.toContain("w_organization_social");
  });
  it("canonicalises URNs without duplicate prefixes or double encoding", () => {
    expect(linkedinId("urn:li:sponsoredAccount:123")).toBe("123");
    expect(linkedinUrn("sponsoredAccount", "urn:li:sponsoredAccount:123")).toBe(
      "urn:li:sponsoredAccount:123",
    );
    const value = restliList(["urn:li:organization:123"]);
    expect(value).toBe("List(urn%3Ali%3Aorganization%3A123)");
    expect(restliQuery({ids: value})).not.toContain("%253A");
    expect(restliQuery({search: "(status:(values:List(ACTIVE)))"})).toContain(
      "search=(status:(values:List(ACTIVE)))",
    );
  });
  it("applies required headers and never puts the token in the URL", async () => {
    const request = vi.fn(
        async (url: RequestInfo | URL, _init?: RequestInit) =>
          new Response(
            JSON.stringify(
              String(url).includes("/v2/userinfo")
                ? {sub: "member-1", name: "Ada"}
                : {elements: [], metadata: {}},
            ),
            {status: 200},
          ),
      ),
      client = new LinkedInClient("super-secret-token-value", request as typeof fetch);
    await client.identity();
    await client.adAccounts();
    const [userUrl, userInit] = request.mock.calls[0];
    const userHeaders = (userInit as RequestInit).headers as Record<string, string>;
    expect(String(userUrl)).toBe("https://api.linkedin.com/v2/userinfo");
    expect(String(userUrl)).not.toContain("super-secret");
    expect(() => new Headers(userHeaders)).not.toThrow();
    expect(userHeaders).toEqual({
      Authorization: "Bearer super-secret-token-value",
      Accept: "application/json",
      "X-Correlation-ID": expect.any(String),
    });
    const [adUrl, adInit] = request.mock.calls[1];
    const adHeaders = (adInit as RequestInit).headers as Record<string, string>;
    expect(String(adUrl)).toContain("q=search");
    expect(String(adUrl)).toContain("pageSize=100");
    expect(String(adUrl)).not.toContain("start=");
    expect(adHeaders).toMatchObject({
      "Linkedin-Version": "202607",
      "X-Restli-Protocol-Version": "2.0.0",
      "X-RestLi-Method": "FINDER",
    });
  });
  it("keeps LinkedIn's status when a call is rejected", async () => {
    const client = new LinkedInClient(
      "super-secret-token-value",
      vi.fn(
        async () =>
          new Response(JSON.stringify({message: "Header is not a finder"}), {status: 400}),
      ) as typeof fetch,
    );
    await expect(client.identity()).rejects.toMatchObject({
      kind: "invalid_parameter",
      message: "LinkedIn API request failed (400): Header is not a finder",
    } as LinkedInError);
  });
  it("classifies rate limits safely", async () => {
    const client = new LinkedInClient(
      "super-secret-token-value",
      vi.fn(
        async () => new Response(JSON.stringify({message: "too many"}), {status: 429}),
      ) as typeof fetch,
    );
    await expect(client.identity()).rejects.toMatchObject({kind: "rate_limit"} as LinkedInError);
  });
  it("translates aggregate reporting deterministically", () => {
    const record = {
        kind: "ad_metric" as const,
        assetId: "1",
        entityType: "account" as const,
        entityId: "1",
        date: "2026-07-28",
        currency: "GBP",
        metrics: {impressions: 10, costInLocalCurrency: "1.25"},
        attribution: "LinkedIn-reported attribution",
      },
      ctx = {organisationId: "org", integrationId: "int", receivedAt: "2026-07-29T00:00:00.000Z"},
      a = translateLinkedIn(record, ctx, "rev"),
      b = translateLinkedIn(record, ctx, "rev");
    expect(a).toEqual(b);
    expect(a.source).toBe("linkedin");
    expect(a.metadata?.privacy).toBe("aggregate_only");
  });
  it("keeps duplicate revisions out of later syncs", async () => {
    const client = {
        identity: vi.fn(async () => ({id: "m", name: "Member"})),
        entities: vi.fn(async () => []),
        adAnalytics: vi.fn(async () => [
          {
            kind: "ad_metric",
            assetId: "1",
            entityType: "account",
            entityId: "1",
            date: "2026-07-28",
            metrics: {impressions: 10},
          },
        ]),
        pageAnalytics: vi.fn(async () => []),
      } as unknown as LinkedInClient,
      settings = {
        adAccounts: [
          {
            kind: "ad_account" as const,
            id: "1",
            urn: "urn:li:sponsoredAccount:1",
            name: "One",
            selected: true,
          },
        ],
        fingerprints: {},
      },
      first = await new LinkedInConnector(
        client,
        settings,
        () => new Date("2026-07-29T00:00:00Z"),
      ).sync({organisationId: "org", integrationId: "int"}),
      second = await new LinkedInConnector(
        client,
        {...settings, fingerprints: first.settings?.fingerprints as Record<string, string>},
        () => new Date("2026-07-29T00:00:00Z"),
      ).sync({organisationId: "org", integrationId: "int"});
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(0);
  });
});
