import {describe, expect, it} from "vitest";
import {explainEvent, humaniseDates, shortDate} from "@/lib/events/explain";

describe("explainEvent", () => {
  it("never shows backwards ISO dates", () => {
    expect(humaniseDates("Facebook Page · XUFU · 2026-10-10")).toMatch(/· 10 Oct( 2026)?$/);
    expect(shortDate("2025-03-02", new Date("2026-10-11"))).toBe("2 Mar 2025");
  });

  it("explains a Facebook day with its figures", () => {
    const e = explainEvent({
      source: "meta_social",
      event_type: "meta_social.facebook.performance.daily_recorded",
      title: "Facebook Page · XUFU · 2026-10-10",
      severity: "info",
      metadata: {
        sourceEntityName: "XUFU",
        reportingDate: "2026-10-10",
        metrics: {followers: 1025, page_daily_follows: 1, page_post_engagements: 3},
      },
    });
    expect(e.title).toBe("XUFU on Facebook: 1,025 followers");
    expect(e.detail).toMatch(
      /^On 10 Oct( 2026)?: 1 new follower, 3 engagements, 1,025 followers in total.$/,
    );
    expect(e.title).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("says what to do when rankings slip, with a link", () => {
    const e = explainEvent({
      source: "google_search_console",
      event_type: "google_search_console.position_declined",
      title: "Average ranking declined",
      severity: "warning",
      metadata: {
        propertyUrl: "https://rabbitcare.co.uk/",
        currentPosition: 31.35,
        previousPosition: 28.16,
        currentStart: "2026-10-01",
        currentEnd: "2026-10-07",
      },
    });
    expect(e.title).toBe("rabbitcare.co.uk slipped in Google rankings");
    expect(e.detail).toContain("from 28 to 31");
    expect(e.detail).toMatch(/1 Oct( 2026)? – 7 Oct/);
    expect(e.advice).toBeTruthy();
    expect(e.action?.href).toContain("search.google.com/search-console");
  });

  it("treats a cancelled CI run as an update, not a problem", () => {
    const e = explainEvent({
      source: "github",
      event_type: "workflow.failed",
      title: "CI failed",
      severity: "critical",
      metadata: {conclusion: "cancelled", repository: "a/b", branch: "main"},
    });
    expect(e.status).toBe("info");
    expect(e.title).toBe("CI was cancelled");
  });

  it("falls back to the stored title with dates tidied", () => {
    const e = explainEvent({
      source: "x",
      event_type: "x.unknown",
      title: "Something on 2026-10-09",
      description: null,
      severity: "weird",
    });
    expect(e.title).toMatch(/^Something on 9 Oct( 2026)?$/);
    expect(e.status).toBe("info");
  });
});
