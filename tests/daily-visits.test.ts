import {describe, expect, it, vi} from "vitest";
import {GoogleAnalyticsClient} from "@/lib/integrations/google-analytics/client";
import {
  DAILY_VISIT_DAYS,
  GoogleAnalyticsConnector,
} from "@/lib/integrations/google-analytics/connector";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {statsSections} from "@/lib/stats/stats";
import {isLowSignalEventType} from "@/lib/ui/labels";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-31T09:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-31T09:00:00.000Z");
const token = {accessToken: "access", expiresAt: "2099-01-01T00:00:00.000Z"};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const totals = {rows: [{metricValues: Array.from({length: 10}, () => ({value: "10"}))}]};

/** A recorded-shape Analytics Data API: the property, the weekly reports and the daily report. */
function fakeGoogle(daily: () => Response) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("analyticsadmin"))
      return reply({
        name: "properties/538665948",
        displayName: "Rabbitcare",
        timeZone: "Europe/London",
        account: "accounts/1",
      });
    const body = JSON.parse(String(init?.body));
    if (body.dimensions?.[0]?.name === "date") return daily();
    return reply(body.dimensions?.length ? {rows: []} : totals);
  });
}
const days = (...rows: [string, number][]) =>
  reply({
    rows: rows.map(([date, sessions]) => ({
      dimensionValues: [{value: date}],
      metricValues: [{value: String(sessions)}, {value: String(Math.round(sessions * 0.8))}],
    })),
  });

describe("daily website visits", () => {
  it("fetches a year of days on the first sync and a month after that", async () => {
    const request = fakeGoogle(() => days(["20261029", 153], ["20261030", 171]));
    const result = await new GoogleAnalyticsConnector(
      new GoogleAnalyticsClient(token, request as typeof fetch),
      {propertyId: "538665948"},
      fixedNow,
    ).sync(context);
    const dailyCall = request.mock.calls.find(
      ([, init]) => JSON.parse(String(init?.body ?? "{}")).dimensions?.[0]?.name === "date",
    )!;
    const range = JSON.parse(String(dailyCall[1]?.body)).dateRanges[0];
    expect(range.endDate).toBe("2026-10-30");
    expect((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1).toBe(
      DAILY_VISIT_DAYS.initial,
    );
    const visits = result.events.filter((e) => e.eventType === "analytics.visits.daily_recorded");
    expect(visits).toHaveLength(2);
    expect(visits[0]).toMatchObject({
      title: "Website visits: 153",
      occurredAt: "2026-10-29T12:00:00.000Z",
      externalId: "ga4:538665948:visits_daily:2026-10-29:153",
      metadata: {
        propertyId: "538665948",
        reportingDate: "2026-10-29",
        sessions: 153,
        activeUsers: 122,
      },
    });
    expect(result.settings).toMatchObject({
      propertyId: "538665948",
      dailyVisitsFrom: range.startDate,
    });

    const later = fakeGoogle(() => days(["20261030", 171]));
    const second = await new GoogleAnalyticsConnector(
      new GoogleAnalyticsClient(token, later as typeof fetch),
      {propertyId: "538665948", dailyVisitsFrom: range.startDate},
      fixedNow,
    ).sync(context);
    const laterRange = JSON.parse(
      String(
        later.mock.calls.find(
          ([, init]) => JSON.parse(String(init?.body ?? "{}")).dimensions?.[0]?.name === "date",
        )![1]?.body,
      ),
    ).dateRanges[0];
    expect(laterRange.startDate).toBe("2026-10-01");
    expect(second.settings).toBeUndefined();
  });

  it("still records the weekly summary if the daily report fails", async () => {
    const request = fakeGoogle(() => reply({error: {code: 500, message: "backend"}}, 500));
    const result = await new GoogleAnalyticsConnector(
      new GoogleAnalyticsClient(token, request as typeof fetch),
      {propertyId: "538665948"},
      fixedNow,
    ).sync(context);
    expect(result.events.some((e) => e.eventType === "analytics.performance_summary")).toBe(true);
    expect(result.events.some((e) => e.eventType === "analytics.visits.daily_recorded")).toBe(
      false,
    );
    expect(result.settings).toBeUndefined();
  });

  it("keeps daily readings out of the activity list", () => {
    expect(isLowSignalEventType("analytics.visits.daily_recorded")).toBe(true);
  });

  it("draws visits per day on Stats and totals them, using Google's latest count for a day", () => {
    const now = new Date("2026-10-31T18:00:00Z");
    const day = (
      date: string,
      sessions: number,
      recordedAt = `${date}T23:00:00Z`,
      property = "538665948",
    ) =>
      ({
        id: `${property}-${date}-${sessions}`,
        source: "google_analytics",
        eventType: "analytics.visits.daily_recorded",
        title: "visits",
        description: null,
        severity: "info",
        occurredAt: `${date}T12:00:00.000Z`,
        recordedAt,
        metadata: {propertyId: property, sessions},
      }) as IntelligenceEvent;
    const weekly = {
      id: "weekly",
      source: "google_analytics",
      eventType: "analytics.performance_summary",
      title: "summary",
      description: null,
      severity: "info",
      occurredAt: "2026-10-30T06:59:59Z",
      recordedAt: "2026-10-30T14:49:31Z",
      metadata: {metric: "sessions", propertyId: "538665948", currentValue: 1053},
    } as IntelligenceEvent;
    const visits = statsSections({
      events: [
        weekly,
        day("2026-10-22", 50),
        day("2026-10-29", 140, "2026-10-30T09:00:00Z"),
        // Google revised the 29th upwards the next day.
        day("2026-10-29", 153, "2026-10-31T09:00:00Z"),
        day("2026-10-30", 171),
        day("2026-10-30", 9, "2026-10-31T09:00:00Z", "999"),
      ],
      period: "week",
      now,
    })
      .find((s) => s.key === "website")!
      .charts.find((c) => c.key === "visits")!;
    expect(visits.value).toBe(333);
    expect(visits.note).toBeUndefined();
    expect(visits.change).toBe(566);
    expect(visits.trend.current.filter((v) => v)).toEqual([153, 180]);

    // A site that hasn't synced daily visits yet still shows its weekly reading.
    const fallback = statsSections({events: [weekly], period: "week", now})
      .find((s) => s.key === "website")!
      .charts.find((c) => c.key === "visits")!;
    expect(fallback).toMatchObject({value: 1053, note: "In the 7 days to the latest reading"});
  });
});
