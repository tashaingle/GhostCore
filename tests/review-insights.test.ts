import {describe, expect, it} from "vitest";
import {lowRatingReviewsRule} from "@/lib/intelligence/rules/reviews/low-rating-reviews";
import {ratingDropRule} from "@/lib/intelligence/rules/reviews/rating-drop";
import type {IntelligenceEvent} from "@/lib/intelligence/types";

const now = new Date("2026-10-08T12:00:00.000Z");
let n = 0;
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const play = (stars: number, ago: number, text = "Crashes on start"): IntelligenceEvent => ({
  id: `e${++n}`,
  source: "google_play",
  eventType: "google_play.review.received",
  title: `${stars}-star review on Ghost`,
  description: text,
  severity: stars <= 2 ? "warning" : "good",
  occurredAt: daysAgo(ago),
  metadata: {packageName: "com.example.ghost", reviewId: `r${n}`, starRating: stars},
});
const appStore = (stars: number, ago: number): IntelligenceEvent => ({
  ...play(stars, ago),
  source: "app_store",
  eventType: "app_store.review.received",
  metadata: {appId: "123", reviewId: `a${n}`, starRating: stars},
});
const place = (stars: number, ago: number, replied: boolean): IntelligenceEvent => ({
  ...play(stars, ago),
  source: "google_business_profile",
  eventType: "google_business_profile.review.received",
  title: `${stars}-star review on Google for Ghost Café`,
  metadata: {location: "locations/2", reviewId: `g${n}`, starRating: stars, replied},
});

describe("review insights", () => {
  it("flags a single low review with its words and where to reply", () => {
    const [insight] = lowRatingReviewsRule.evaluate([play(1, 1), play(5, 1)], {now});
    expect(insight.title).toBe("An unanswered 1-star review on Ghost this week");
    expect(insight.summary).toBe('Someone left Ghost 1 star on Google Play: "Crashes on start"');
    expect(insight.severity).toBe("warning");
    expect(insight.recommendation).toContain("Play Console");
  });

  it("groups by app, escalates at three, and ignores old or answered reviews", () => {
    const insights = lowRatingReviewsRule.evaluate(
      [
        play(1, 1),
        play(2, 2),
        play(1, 3),
        play(1, 9),
        appStore(2, 1),
        place(1, 1, true),
        place(2, 1, false),
      ],
      {now},
    );
    expect(insights.map((i) => i.title).sort()).toEqual([
      "3 unanswered low reviews on Ghost this week",
      "An unanswered 2-star review on Ghost Café this week",
      "An unanswered 2-star review on Ghost this week",
    ]);
    const playInsight = insights.find((i) => i.title.startsWith("3"))!;
    expect(playInsight.severity).toBe("critical");
    expect(playInsight.summary).toContain("2 of them 1 star");
    expect(insights.find((i) => i.title.includes("Café"))?.recommendation).toContain(
      "Business Profile",
    );
  });

  it("flags a rating drop of half a star with enough reviews", () => {
    const before = [5, 5, 4, 5, 4].map((s, i) => play(s, 16 + i)),
      after = [3, 4, 3, 4, 3].map((s, i) => play(s, 1 + i));
    const [insight] = ratingDropRule.evaluate([...before, ...after], {now});
    expect(insight.title).toBe("Ghost's rating fell from 4.6 to 3.4 stars");
    expect(insight.severity).toBe("critical");
    expect(ratingDropRule.evaluate([...before, ...after.slice(0, 4)], {now})).toEqual([]);
    expect(
      ratingDropRule.evaluate([...before, ...[5, 4, 4, 5, 4].map((s, i) => play(s, 1 + i))], {
        now,
      }),
    ).toEqual([]);
  });
});
