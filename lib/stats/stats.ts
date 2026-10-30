import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {
  PERFORMANCE_EVENT_TYPES,
  PERIOD_DAYS,
  performanceMetrics,
  trendBuilder,
  type Period,
  type Trend,
} from "@/lib/home/performance";

const DAY = 86_400_000;

export const STATS_EVENT_TYPES = [
  ...new Set([
    ...PERFORMANCE_EVENT_TYPES,
    "analytics.performance_summary",
    "google_search_console.performance_summary",
    "meta_social.facebook.performance.daily_recorded",
  ]),
];

export type StatChart = {
  key: string;
  label: string;
  source: string;
  /** What the headline number means, e.g. "in the last 7 days". */
  note?: string;
  trend: Trend;
  /** This period's figure: the total, or the latest reading for snapshots. */
  value: number;
  /** % change against the period before; null when there's nothing to compare. */
  change: number | null;
};

export type StatSection = {
  key: "website" | "social" | "sales" | "email";
  title: string;
  charts: StatChart[];
  /** Where website visits came from, most first. */
  sources?: {label: string; value: number}[];
};

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const meta = (e: IntelligenceEvent, key: string) => e.metadata[key];
const at = (e: IntelligenceEvent) => Date.parse(e.occurredAt);
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const percent = (before: number, now: number) =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;

/**
 * Rolling summaries (Analytics, Search Console) and page snapshots arrive per property each day.
 * This keeps the newest reading per property per day, then adds the properties together.
 */
function dailyTotals(
  events: IntelligenceEvent[],
  property: (e: IntelligenceEvent) => string,
  value: (e: IntelligenceEvent) => number | null,
) {
  const newest = new Map<string, IntelligenceEvent>();
  for (const e of events) {
    const id = `${dayKey(at(e))}|${property(e)}`,
      found = newest.get(id);
    if (!found || at(e) > at(found)) newest.set(id, e);
  }
  const days = new Map<string, {t: number; v: number}>();
  for (const e of newest.values()) {
    const v = value(e);
    if (v === null) continue;
    const key = dayKey(at(e)),
      found = days.get(key);
    days.set(key, {t: Math.max(found?.t ?? 0, at(e)), v: (found?.v ?? 0) + v});
  }
  return [...days.values()];
}

function chart(
  base: Omit<StatChart, "trend" | "value" | "change">,
  points: {t: number; v: number}[],
  mode: "sum" | "last",
  build: ReturnType<typeof trendBuilder>,
): StatChart | null {
  const trend = build(points, mode, {kind: "count"}),
    total = (values: (number | null)[]) =>
      mode === "sum"
        ? values.reduce<number>((a, v) => a + (v ?? 0), 0)
        : ([...values].reverse().find((v) => v !== null) ?? null),
    now = total(trend.current),
    before = total(trend.previous);
  if (now === null || [...trend.current, ...trend.previous].every((v) => !v)) return null;
  return {...base, trend, value: now, change: before === null ? null : percent(before, now)};
}

/** Every chart the stats page can draw for one business and period, grouped by area. */
export function statsSections(input: {
  events: IntelligenceEvent[];
  period: Period;
  now?: Date;
}): StatSection[] {
  const now = input.now ?? new Date(),
    build = trendBuilder(input.period, now),
    ofType = (type: string) => input.events.filter((e) => e.eventType === type),
    sections: StatSection[] = [];

  // Website: Analytics visits (each reading covers the 7 days before it) and Search Console.
  const visits = ofType("analytics.performance_summary").filter(
    (e) => (meta(e, "metric") ?? "sessions") === "sessions",
  );
  const searches = ofType("google_search_console.performance_summary");
  const property = (e: IntelligenceEvent) =>
    String(meta(e, "propertyId") ?? meta(e, "propertyUrl") ?? "");
  const lastWeek = "In the 7 days to the latest reading";
  const website = [
    chart(
      {key: "visits", label: "Website visits", source: "Google Analytics", note: lastWeek},
      dailyTotals(visits, property, (e) => num(meta(e, "currentValue"))),
      "last",
      build,
    ),
    chart(
      {key: "searchClicks", label: "Google search clicks", source: "Search Console", note: lastWeek},
      dailyTotals(searches, property, (e) => num(meta(e, "clicks"))),
      "last",
      build,
    ),
    chart(
      {
        key: "searchImpressions",
        label: "Times seen on Google",
        source: "Search Console",
        note: lastWeek,
      },
      dailyTotals(searches, property, (e) => num(meta(e, "impressions"))),
      "last",
      build,
    ),
  ].filter((c): c is StatChart => c !== null);
  // Visitor sources from the newest reading of each Analytics property in this period.
  const periodStart = now.getTime() - PERIOD_DAYS[input.period] * DAY,
    latest = new Map<string, IntelligenceEvent>();
  for (const e of visits.filter((e) => at(e) >= periodStart)) {
    const found = latest.get(property(e));
    if (!found || at(e) > at(found)) latest.set(property(e), e);
  }
  const channels = new Map<string, number>();
  for (const e of latest.values()) {
    const list = meta(e, "currentChannels");
    if (list && typeof list === "object" && !Array.isArray(list))
      for (const [label, value] of Object.entries(list as Record<string, unknown>)) {
        const v = num(value);
        if (v) channels.set(label, (channels.get(label) ?? 0) + v);
      }
  }
  const sources = [...channels.entries()]
    .map(([label, value]) => ({label, value}))
    .sort((a, b) => b.value - a.value);
  if (website.length || sources.length)
    sections.push({key: "website", title: "Website", charts: website, sources});

  // Social: Facebook Page readings, one per page per day.
  const pages = ofType("meta_social.facebook.performance.daily_recorded");
  const page = (e: IntelligenceEvent) => String(meta(e, "sourceEntityId") ?? "");
  const pageMetric = (key: string) => (e: IntelligenceEvent) =>
    num((meta(e, "metrics") as Record<string, unknown> | undefined)?.[key]);
  const social: [string, string, string, "sum" | "last"][] = [
    ["followers", "Facebook followers", "followers", "last"],
    ["reach", "People reached", "page_total_media_view_unique", "sum"],
    ["views", "Content views", "page_media_view", "sum"],
    ["engagements", "Post engagements", "page_post_engagements", "sum"],
    ["newFollows", "New follows", "page_daily_follows", "sum"],
    ["videoViews", "Video views", "page_video_views", "sum"],
  ];
  const socialCharts = social
    .map(([key, label, field, mode]) =>
      chart({key, label, source: "Facebook"}, dailyTotals(pages, page, pageMetric(field)), mode, build),
    )
    .filter((c): c is StatChart => c !== null);
  if (socialCharts.length) sections.push({key: "social", title: "Social media", charts: socialCharts});

  // Sales, ads and email come from the same figures as Home, so the two always agree.
  const metrics = performanceMetrics({events: input.events, counts: {}, period: input.period, now});
  const fromHome = (keys: string[]) =>
    keys.flatMap((key) => {
      const m = metrics.find((item) => item.key === key);
      if (!m?.trend) return [];
      const latest = (values: (number | null)[]) =>
        [...values].reverse().find((v) => v !== null) ?? 0;
      const snapshot = m.trend.unit.kind === "count" && ["emailSubscribers"].includes(key);
      const total = (values: (number | null)[]) =>
        snapshot ? latest(values) : values.reduce<number>((a, v) => a + (v ?? 0), 0);
      return [
        {
          key,
          label: m.label,
          source: m.source,
          trend: m.trend,
          value: total(m.trend.current),
          change: m.change,
        },
      ];
    });
  const sales = fromHome(["revenue", "orders", "adSpend"]);
  if (sales.length) sections.push({key: "sales", title: "Sales and ads", charts: sales});
  const email = fromHome(["emailSubscribers"]);
  if (email.length) sections.push({key: "email", title: "Email", charts: email});
  return sections;
}
