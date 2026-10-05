import {beforeEach, describe, expect, it, vi} from "vitest";
import {missingPlayScopes, PLAY_SCOPES, scopesGranted} from "@/lib/integrations/google-play/config";
import {
  assertPlayRead,
  GooglePlayClient,
  GooglePlayError,
  playPackage,
} from "@/lib/integrations/google-play/client";
import {GooglePlayConnector} from "@/lib/integrations/google-play/connector";
import {authorisationUrl, stateMatches} from "@/lib/integrations/google-play/oauth";
import {crashPercent, translatePlayReview} from "@/lib/integrations/google-play/translator";
import {loadConnector} from "@/lib/integrations/loader";
import {providerRegistry} from "@/lib/integrations/registry";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-04T00:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-04T00:00:00.000Z");

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "super-secret";
  process.env.GOOGLE_PLAY_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-play/callback";
});

describe("Google Play connection", () => {
  it("asks for Play reads and keeps the secret out of the url", () => {
    const url = authorisationUrl("state.one", "verifier");
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    for (const scope of PLAY_SCOPES) expect(url).toContain(encodeURIComponent(scope));
    expect(url).not.toContain("super-secret");
    expect(url).not.toContain("devstorage");
    expect(url).not.toMatch(/:reply|reviewrefund/);
    expect(scopesGranted(PLAY_SCOPES.join(" "))).toBe(true);
    expect(scopesGranted(PLAY_SCOPES.join(","))).toBe(true);
    expect(scopesGranted(undefined)).toBe(true);
    expect(
      scopesGranted(
        "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/playdeveloperreporting https://www.googleapis.com/auth/androidpublisher",
      ),
    ).toBe(true);
    expect(scopesGranted("openid email")).toBe(false);
    expect(
      missingPlayScopes("openid https://www.googleapis.com/auth/playdeveloperreporting"),
    ).toEqual(["Play reviews"]);
    expect(stateMatches("same", "same")).toBe(true);
    expect(stateMatches("same", "bad")).toBe(false);
    expect(providerRegistry.google_play.capabilities).not.toContain("read_only");
    expect(providerRegistry.google_play.propertySelection).toBe(true);
    expect(providerRegistry.google_play.connectPath).toBe("/api/integrations/google-play/connect");
  });

  it("refuses review replies, refunds, and writes on the publisher api", () => {
    expect(() =>
      assertPlayRead("https://androidpublisher.googleapis.com/reviews/1:reply", "POST"),
    ).toThrow(GooglePlayError);
    expect(() =>
      assertPlayRead("https://androidpublisher.googleapis.com/orders/1:refund", "POST"),
    ).toThrow(/refund/i);
    expect(() =>
      assertPlayRead(
        "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/reviews",
        "POST",
      ),
    ).toThrow(/only reads/);
    expect(() =>
      assertPlayRead(
        "https://playdeveloperreporting.googleapis.com/v1beta1/apps/com.example.app/crashRateMetricSet:query",
        "POST",
      ),
    ).not.toThrow();
    expect(() => playPackage("../secret")).toThrow(/not valid/);
  });

  it("lists apps and reads reviews without keeping the reviewer name", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      expect(href).not.toContain("act.secret");
      expect(href).not.toMatch(/:reply|refund|reviewrefund/);
      if (href.includes("pageToken=page-2"))
        return new Response(JSON.stringify({apps: [{packageName: "not a package"}]}), {
          status: 200,
        });
      if (href.includes("apps:search")) {
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(
          JSON.stringify({
            apps: [{packageName: "com.example.app", displayName: "Example"}],
            nextPageToken: "page-2",
          }),
          {status: 200},
        );
      }
      if (href.includes("/reviews")) {
        expect(init?.method ?? "GET").toBe("GET");
        expect(href).toContain("/applications/com.example.app/reviews");
        return new Response(
          JSON.stringify({
            reviews: [
              {
                reviewId: "rev-1",
                authorName: "Secret Name",
                comments: [
                  {
                    userComment: {
                      text: "Too many ads <b>today</b>",
                      starRating: 1,
                      appVersionName: "2.0",
                      lastModified: {seconds: "100"},
                    },
                  },
                ],
              },
            ],
          }),
          {status: 200},
        );
      }
      throw new Error(href);
    });
    const client = new GooglePlayClient({accessToken: "act.secret"}, request as typeof fetch);
    await expect(client.apps()).resolves.toEqual([
      {packageName: "com.example.app", displayName: "Example"},
    ]);
    const reviews = await client.reviews("com.example.app");
    expect(JSON.stringify(reviews)).not.toContain("Secret Name");
    expect(reviews.reviews[0]).toMatchObject({
      reviewId: "rev-1",
      starRating: 1,
      text: "Too many ads <b>today</b>",
    });
    await expect(client.reviews("../secret")).rejects.toMatchObject({kind: "provider"});
    expect(request).not.toHaveBeenCalledWith(
      expect.stringContaining("../secret"),
      expect.anything(),
    );
  });

  it("treats an invalid token as expired access", async () => {
    const request = vi.fn(
      async () => new Response(JSON.stringify({error: {message: "no"}}), {status: 401}),
    );
    const client = new GooglePlayClient({accessToken: "act.secret"}, request as typeof fetch);
    await expect(client.apps()).rejects.toMatchObject({kind: "unauthorized"} as GooglePlayError);
  });

  it("records a new review and the daily crash rate, and skips an old review", async () => {
    const now = Math.floor(fixedNow().getTime() / 1000);
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      expect(href).not.toMatch(/:reply|\/refund|reviewrefund/);
      if (href.includes("/reviews")) {
        expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
        return new Response(
          JSON.stringify({
            reviews: [
              {
                reviewId: "rev-new",
                authorName: "Secret Name",
                comments: [
                  {
                    userComment: {
                      text: "Too many ads <b>today</b>",
                      starRating: 1,
                      lastModified: {seconds: String(now - 3600)},
                    },
                  },
                ],
              },
              {
                reviewId: "rev-old",
                authorName: "Older Name",
                comments: [
                  {
                    userComment: {
                      text: "old",
                      starRating: 5,
                      lastModified: {seconds: String(now - 40 * 86400)},
                    },
                  },
                ],
              },
            ],
          }),
          {status: 200},
        );
      }
      expect(init?.method).toBe("POST");
      expect(href).toContain("/apps/com.example.app/crashRateMetricSet:query");
      const body = JSON.parse(String(init?.body));
      expect(body.userCohort).toBe("OS_PUBLIC");
      expect(body.metrics).toEqual(["crashRate", "distinctUsers"]);
      return new Response(
        JSON.stringify({
          rows: [
            {
              startTime: {year: 2026, month: 10, day: 3},
              metrics: [
                {metric: "crashRate", decimalValue: {value: "0.012"}},
                {metric: "distinctUsers", decimalValue: {value: "1000"}},
              ],
            },
          ],
        }),
        {status: 200},
      );
    });
    const connector = new GooglePlayConnector(
      new GooglePlayClient({accessToken: "act.secret"}, request as typeof fetch),
      {apps: [{packageName: "com.example.app", displayName: "Example", selected: true}]},
      fixedNow,
    );
    const result = await connector.sync(context);
    expect(result.events.map((event) => event.eventType)).toEqual([
      "google_play.review.received",
      "google_play.stability.recorded",
    ]);
    const dumped = JSON.stringify(result.events);
    expect(dumped).not.toContain("Secret Name");
    expect(dumped).not.toContain("Older Name");
    expect(result.events[0]).toMatchObject({
      title: "1-star review on Example",
      description: "Too many ads today",
      severity: "warning",
      externalId: "google_play:review:com.example.app:rev-new",
    });
    expect(result.events[1]?.title).toBe("Example · 1.2% of people hit a crash");
    expect(result.events[1]?.severity).toBe("warning");
    expect(result.settings?.lastReviewSeconds).toEqual({"com.example.app": now - 3600});
    expect(crashPercent(0)).toBe("0%");
  });

  it("requires a chosen app and surfaces a missing Play permission", async () => {
    const client = new GooglePlayClient({accessToken: "act.secret"});
    await expect(
      new GooglePlayConnector(client, {apps: []}, fixedNow).sync(context),
    ).rejects.toThrow(/Choose at least one Play app/);
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({error: {message: "Google Play Android Developer API has not been used"}}),
          {status: 403},
        ),
    );
    await expect(
      new GooglePlayConnector(
        new GooglePlayClient({accessToken: "act.secret"}, request as typeof fetch),
        {apps: [{packageName: "com.example.app", displayName: "Example", selected: true}]},
        fixedNow,
      ).sync(context),
    ).rejects.toMatchObject({kind: "permission"});
  });

  it("loads from the registry", () => {
    expect(
      loadConnector("google_play", {
        accessToken: "act.token",
        settings: {apps: []},
      }).provider,
    ).toBe("google_play");
    expect(() => loadConnector("google_play")).toThrow(/Google Play credentials/);
    const event = translatePlayReview(
      {reviewId: "rev-1", starRating: 4, text: "lovely", seconds: 1_791_000_000},
      {packageName: "com.example.app", displayName: "Example"},
      context,
    );
    expect(event?.severity).toBe("good");
    expect(event?.metadata).not.toHaveProperty("authorName");
  });
});
