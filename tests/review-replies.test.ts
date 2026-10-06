import {generateKeyPairSync} from "node:crypto";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {GooglePlayClient} from "@/lib/integrations/google-play/client";
import {GooglePlayConnector} from "@/lib/integrations/google-play/connector";
import {AppStoreClient} from "@/lib/integrations/app-store/client";
import {AppStoreConnector} from "@/lib/integrations/app-store/connector";
import {parseAppStoreKey} from "@/lib/integrations/app-store/key";
import {lowRatingReviewsRule} from "@/lib/intelligence/rules/reviews/low-rating-reviews";
import {AUTO_RESOLVED, reopens, staleInsights} from "@/lib/intelligence/runner";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import type {NormalisedEventInput} from "@/types/events";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const nowSeconds = NOW.getTime() / 1000;
const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: NOW.toISOString(),
};
const json = (body: unknown) => new Response(JSON.stringify(body), {status: 200});
const asIntelligence = (events: NormalisedEventInput[]): IntelligenceEvent[] =>
  events.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    eventType: e.eventType,
    title: e.title,
    description: e.description ?? null,
    severity: e.severity,
    occurredAt: e.occurredAt,
    metadata: e.metadata ?? {},
  }));

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "super-secret";
  process.env.GOOGLE_PLAY_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-play/callback";
});

describe("insights close when their rule stops reporting them", () => {
  it("picks open insights from known rules that weren't reported this run", () => {
    const open = [
      {id: "1", rule_id: "reviews.low_rating", fingerprint: "still"},
      {id: "2", rule_id: "reviews.low_rating", fingerprint: "gone"},
      {id: "3", rule_id: "someone.elses_rule", fingerprint: "other"},
    ];
    expect(staleInsights(open, new Set(["still"])).map((row) => row.id)).toEqual(["2"]);
  });

  it("reopens only what Metric Mage closed itself", () => {
    expect(reopens({status: "resolved", metadata: {[AUTO_RESOLVED]: true}})).toBe(true);
    expect(reopens({status: "resolved", metadata: {}})).toBe(false);
    expect(reopens({status: "dismissed", metadata: {[AUTO_RESOLVED]: true}})).toBe(false);
  });
});

describe("review replies", () => {
  it("Play: reads replies, records a later reply once, and the alert clears", async () => {
    const review = (id: string, stars: number, hoursAgo: number, reply?: string) => ({
      reviewId: id,
      comments: [
        {
          userComment: {
            text: "Keeps crashing",
            starRating: stars,
            lastModified: {seconds: String(nowSeconds - hoursAgo * 3600)},
          },
        },
        ...(reply ? [{developerComment: {text: reply}}] : []),
      ],
    });
    const request = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/reviews"))
        return json({
          reviews: [
            review("new-low", 1, 1),
            review("old-low-answered", 2, 30, "Sorry, fixed in 2.1"),
            review("old-low-open", 1, 40),
            review("old-high-answered", 5, 50, "Thanks!"),
            review("too-old-answered", 1, 24 * 9, "Thanks"),
          ],
        });
      return json({rows: []});
    });
    const result = await new GooglePlayConnector(
      new GooglePlayClient({accessToken: "a"}, request as typeof fetch),
      {
        apps: [{packageName: "com.example.app", displayName: "Example", selected: true}],
        lastReviewSeconds: {"com.example.app": nowSeconds - 2 * 3600},
      },
      () => NOW,
    ).sync(context);
    expect(result.events.map((e) => [e.eventType, e.externalId])).toEqual([
      ["google_play.review.received", "google_play:review:com.example.app:new-low"],
      ["google_play.review.replied", "google_play:review_reply:com.example.app:old-low-answered"],
    ]);
    expect(result.events[0].metadata?.replied).toBe(false);
    expect(result.events[1].title).toBe("Replied to a 2-star review on Example");

    // The earlier sync stored the 2-star review unanswered; the reply event clears it.
    const earlier: NormalisedEventInput = {
      ...result.events[0],
      title: "2-star review on Example",
      occurredAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString(),
      externalId: "google_play:review:com.example.app:old-low-answered",
      metadata: {packageName: "com.example.app", reviewId: "old-low-answered", starRating: 2},
    };
    const titles = lowRatingReviewsRule
      .evaluate(asIntelligence([result.events[0], earlier, result.events[1]]), {now: NOW})
      .map((insight) => insight.title);
    expect(titles).toEqual(["An unanswered 1-star review on Example this week"]);
  });

  it("App Store: asks Apple for responses and reads them", async () => {
    const pem = generateKeyPairSync("ec", {namedCurve: "prime256v1"})
        .privateKey.export({type: "pkcs8", format: "pem"})
        .toString(),
      key = parseAppStoreKey({
        issuerId: "57246542-96fe-1a63-e053-0824d011072a",
        keyId: "2X9R4HXF34",
        privateKey: pem,
      }),
      ago = (hours: number) => new Date(NOW.getTime() - hours * 3600_000).toISOString();
    const request = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain("include=response");
      return json({
        data: [
          {
            id: "fresh",
            attributes: {rating: 1, createdDate: ago(1)},
            relationships: {response: {data: null}},
          },
          {
            id: "answered",
            attributes: {rating: 2, createdDate: ago(30)},
            relationships: {response: {data: {type: "customerReviewResponses", id: "r1"}}},
          },
        ],
      });
    });
    const result = await new AppStoreConnector(
      new AppStoreClient(key, request as typeof fetch),
      {
        apps: [{appId: "1", name: "Ghost", bundleId: "", selected: true}],
        lastReviewSeconds: {"1": nowSeconds - 2 * 3600},
      },
      () => NOW,
    ).sync(context);
    expect(result.events.map((e) => e.externalId)).toEqual([
      "app_store:review:1:fresh",
      "app_store:review_reply:1:answered",
    ]);
  });
});
