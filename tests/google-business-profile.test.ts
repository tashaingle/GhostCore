import {beforeEach, describe, expect, it, vi} from "vitest";
import {
  BUSINESS_PROFILE_SCOPES,
  businessScopeGranted,
} from "@/lib/integrations/google-business-profile/config";
import {
  assertBusinessRead,
  BusinessProfileClient,
  BusinessProfileError,
  businessIds,
} from "@/lib/integrations/google-business-profile/client";
import {BusinessProfileConnector} from "@/lib/integrations/google-business-profile/connector";
import {authorisationUrl} from "@/lib/integrations/google-business-profile/oauth";
import {translateBusinessActivity} from "@/lib/integrations/google-business-profile/translator";
import {loadConnector} from "@/lib/integrations/loader";
import {providerRegistry} from "@/lib/integrations/registry";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-04T00:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-04T00:00:00.000Z");
const token = {accessToken: "access", expiresAt: "2099-01-01T00:00:00.000Z"};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const place = {
  account: "accounts/1",
  location: "locations/2",
  title: "Ghost Café",
  selected: true,
};

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "super-secret";
  process.env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-business-profile/callback";
});

describe("Google Business Profile connection", () => {
  it("asks for Business Profile access and keeps the secret out of the url", () => {
    const url = authorisationUrl("state", "verifier");
    for (const scope of BUSINESS_PROFILE_SCOPES) expect(url).toContain(encodeURIComponent(scope));
    expect(url).not.toContain("super-secret");
    expect(businessScopeGranted(undefined)).toBe(true);
    expect(businessScopeGranted(BUSINESS_PROFILE_SCOPES.join(" "))).toBe(true);
    expect(businessScopeGranted("openid email")).toBe(false);
    expect(providerRegistry.google_business_profile.capabilities).not.toContain("read_only");
    expect(providerRegistry.google_business_profile.connectPath).toBe(
      "/api/integrations/google-business-profile/connect",
    );
  });

  it("refuses replies, writes, and other hosts", () => {
    expect(() =>
      assertBusinessRead(
        "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/x/reply",
        "GET",
      ),
    ).toThrow(/reply/);
    expect(() =>
      assertBusinessRead(
        "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews",
        "PUT",
      ),
    ).toThrow(/only reads/);
    expect(() => assertBusinessRead("https://example.com/v1/accounts", "GET")).toThrow(
      BusinessProfileError,
    );
    expect(() => businessIds("accounts/1/../2", "locations/2")).toThrow(/not valid/);
  });

  it("lists locations across accounts", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/v1/accounts?"))
        return reply({accounts: [{name: "accounts/1"}, {name: "bad"}]});
      return reply({
        locations: [
          {
            name: "locations/2",
            title: "Ghost Café",
            storefrontAddress: {addressLines: ["1 High St"], locality: "Yeovil"},
          },
          {name: "nope", title: "Bad"},
        ],
      });
    });
    expect(await new BusinessProfileClient(token, request as typeof fetch).locations()).toEqual([
      {
        account: "accounts/1",
        location: "locations/2",
        title: "Ghost Café",
        address: "1 High St, Yeovil",
      },
    ]);
  });

  it("adds up daily activity and treats a missing value as zero", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      expect(href).toContain("dailyMetrics=CALL_CLICKS");
      expect(href).toContain("dailyRange.startDate.year=2026");
      const day = {year: 2026, month: 10, day: 2};
      return reply({
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              {
                dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
                timeSeries: {datedValues: [{date: day, value: "30"}]},
              },
              {
                dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
                timeSeries: {datedValues: [{date: day, value: "12"}]},
              },
              {dailyMetric: "CALL_CLICKS", timeSeries: {datedValues: [{date: day, value: "1"}]}},
              {dailyMetric: "WEBSITE_CLICKS", timeSeries: {datedValues: [{date: day}]}},
            ],
          },
        ],
      });
    });
    const days = await new BusinessProfileClient(token, request as typeof fetch).activity(
      "locations/2",
      new Date("2026-09-25T00:00:00Z"),
      new Date("2026-10-03T00:00:00Z"),
    );
    expect(days).toEqual([
      {day: "2026-10-02", views: 42, calls: 1, websiteClicks: 0, directions: 0},
    ]);
    const event = translateBusinessActivity(days[0], place, context);
    expect(event?.title).toBe("Ghost Café · 42 views on Google");
    expect(event?.description).toBe("1 call.");
    expect(event?.externalId).toBe("google_business_profile:activity:locations/2:2026-10-02");
  });

  it("syncs new reviews without the reviewer name and remembers the newest", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/reviews"))
        return reply({
          reviews: [
            {
              reviewId: "new",
              starRating: "TWO",
              comment: "Cold coffee (Translated by Google) Café froid",
              createTime: "2026-10-03T09:00:00Z",
              reviewer: {displayName: "Jo Bloggs"},
            },
            {reviewId: "old", starRating: "FIVE", createTime: "2026-08-01T09:00:00Z"},
          ],
          nextPageToken: "more",
        });
      return reply({});
    });
    const result = await new BusinessProfileConnector(
      new BusinessProfileClient(token, request as typeof fetch),
      {locations: [place]},
      fixedNow,
    ).sync(context);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      title: "2-star review on Google for Ghost Café",
      description: "Cold coffee",
      severity: "warning",
      metadata: {replied: false},
    });
    expect(JSON.stringify(result.events)).not.toContain("Jo Bloggs");
    expect(result.settings.lastReviewSeconds).toEqual({
      "locations/2": Date.parse("2026-10-03T09:00:00Z") / 1000,
    });
    expect(String(request.mock.calls.at(-1)?.[0])).toContain("dailyRange.endDate.day=3");
  });

  it("explains an unapproved Google project and a missing location choice", async () => {
    const client = new BusinessProfileClient(token, (async () =>
      reply(
        {error: {message: "Quota exceeded for quota metric 'Requests' with limit 0"}},
        429,
      )) as typeof fetch);
    await expect(client.locations()).rejects.toThrow(/approved/);
    await expect(
      new BusinessProfileConnector(client, {locations: []}).sync(context),
    ).rejects.toThrow(/Choose at least one/);
  });

  it("loads from stored tokens", () => {
    expect(
      loadConnector("google_business_profile", {accessToken: "a", settings: {}}).provider,
    ).toBe("google_business_profile");
  });
});
