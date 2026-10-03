import {formatMinorAmount} from "@/lib/integrations/stripe/translator";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {metaAccountDays, percentChange, sum} from "@/lib/intelligence/windows";

export type Period = "week" | "month" | "year";
export const PERIOD_DAYS: Record<Period, number> = {week: 7, month: 30, year: 365};
export const PERIOD_LABEL: Record<Period, {current: string; previous: string}> = {
  week: {current: "this week", previous: "last week"},
  month: {current: "this month", previous: "last month"},
  year: {current: "this year", previous: "last year"},
};
export const parsePeriod = (value: unknown): Period =>
  value === "month" || value === "year" ? value : "week";

export type MetricGroup = "Money" | "Marketing" | "Operations";
export type Metric = {
  key: string;
  group: MetricGroup;
  label: string;
  value: string;
  /** Percentage change versus the previous period; null when there is nothing to compare. */
  change: number | null;
  source: string;
  /** true: up is good; false: down is good; null: neutral. */
  higherIsBetter: boolean | null;
  /** Enough history in the previous period to call it going well or badly. */
  comparable: boolean;
};

export type Highlight = {tone: "good" | "bad"; text: string};

/** Counts supplied by the page (cheap head queries) for high-volume activity. */
export type ActivityCounts = Partial<
  Record<
    "emails" | "meetings" | "deployments" | "failedBuilds",
    {current: number; previous: number}
  >
>;

/** Event types whose rows are needed (amounts and daily figures); counts are queried separately. */
export const PERFORMANCE_EVENT_TYPES = [
  "stripe.payment_succeeded",
  "stripe.payment_refunded",
  "shopify.order_created",
  "shopify.order_refunded",
  "meta_ads.performance.daily_recorded",
  "meta_social.facebook.performance.daily_recorded",
  "google_search_console.performance_summary",
  "mailchimp.audience.daily_recorded",
  "mailchimp.campaign.results_recorded",
];

const DAY = 86_400_000;
const MIN_PREVIOUS_COUNT = 3;
const HIGHLIGHT_PERCENT = 10;

const change = (previous: number, current: number) => {
  const v = percentChange(previous, current);
  return Number.isFinite(v) ? v : null;
};
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const meta = (e: IntelligenceEvent, key: string) => e.metadata[key];
const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const latestBy = (events: IntelligenceEvent[], key: (e: IntelligenceEvent) => string | null) => {
  const map = new Map<string, IntelligenceEvent>();
  for (const e of events) {
    const k = key(e);
    if (k === null) continue;
    const prev = map.get(k);
    if (!prev || e.occurredAt > prev.occurredAt) map.set(k, e);
  }
  return [...map.values()];
};
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {style: "currency", currency: currency.toUpperCase()}).format(
    amount,
  );
const count = (n: number) => n.toLocaleString("en-GB");

export function performanceMetrics(input: {
  events: IntelligenceEvent[];
  counts: ActivityCounts;
  period: Period;
  now?: Date;
}): Metric[] {
  const now = input.now ?? new Date(),
    days = PERIOD_DAYS[input.period],
    end = now.getTime(),
    currentStart = end - days * DAY,
    previousStart = currentStart - days * DAY,
    inCurrent = (e: IntelligenceEvent) => {
      const t = Date.parse(e.occurredAt);
      return t >= currentStart && t < end;
    },
    inPrevious = (e: IntelligenceEvent) => {
      const t = Date.parse(e.occurredAt);
      return t >= previousStart && t < currentStart;
    },
    ofType = (type: string) => input.events.filter((e) => e.eventType === type),
    metrics: Metric[] = [];

  // Revenue: live Stripe payments, or test mode (labelled) when there are no live ones.
  const payments = ofType("stripe.payment_succeeded").filter(
    (e) => num(meta(e, "amountMinor")) !== null && typeof meta(e, "currency") === "string",
  );
  if (payments.length) {
    const live = payments.filter((e) => meta(e, "mode") === "live"),
      chosen = live.length ? live : payments,
      currency = mostCommon(chosen.map((e) => String(meta(e, "currency"))))!,
      same = chosen.filter((e) => meta(e, "currency") === currency),
      total = (list: IntelligenceEvent[]) => sum(list.map((e) => num(meta(e, "amountMinor"))!)),
      cur = same.filter(inCurrent),
      prev = same.filter(inPrevious);
    metrics.push({
      key: "revenue",
      group: "Money",
      label: "Revenue",
      value: formatMinorAmount(total(cur), currency),
      change: change(total(prev), total(cur)),
      source: live.length ? "Stripe" : "Stripe · test mode",
      higherIsBetter: true,
      comparable: prev.length >= MIN_PREVIOUS_COUNT,
    });
  }

  // Orders and average order value (Shopify).
  const orders = ofType("shopify.order_created");
  if (orders.length) {
    const cur = orders.filter(inCurrent),
      prev = orders.filter(inPrevious);
    metrics.push({
      key: "orders",
      group: "Money",
      label: "Orders",
      value: count(cur.length),
      change: change(prev.length, cur.length),
      source: "Shopify",
      higherIsBetter: true,
      comparable: prev.length >= MIN_PREVIOUS_COUNT,
    });
    const priced = orders.filter((e) => num(meta(e, "amountMinor")) !== null),
      currency = mostCommon(priced.map((e) => String(meta(e, "currency") ?? "")).filter(Boolean));
    if (currency) {
      const same = priced.filter((e) => meta(e, "currency") === currency),
        avg = (list: IntelligenceEvent[]) =>
          list.length ? sum(list.map((e) => num(meta(e, "amountMinor"))!)) / list.length : 0,
        c = same.filter(inCurrent),
        p = same.filter(inPrevious);
      if (c.length)
        metrics.push({
          key: "aov",
          group: "Money",
          label: "Average order",
          value: formatMinorAmount(Math.round(avg(c)), currency),
          change: p.length ? change(avg(p), avg(c)) : null,
          source: "Shopify",
          higherIsBetter: true,
          comparable: p.length >= MIN_PREVIOUS_COUNT && c.length >= MIN_PREVIOUS_COUNT,
        });
    }
  }

  // Refunds: Stripe and Shopify, each refund counted once (latest record per payment/order).
  const refunds = [
    ...latestBy(ofType("stripe.payment_refunded"), (e) =>
      typeof meta(e, "providerObjectId") === "string" ? String(meta(e, "providerObjectId")) : null,
    ),
    ...latestBy(ofType("shopify.order_refunded"), (e) =>
      typeof meta(e, "orderId") === "string" ? String(meta(e, "orderId")) : null,
    ),
  ];
  if (refunds.length) {
    const cur = refunds.filter(inCurrent),
      prev = refunds.filter(inPrevious);
    metrics.push({
      key: "refunds",
      group: "Money",
      label: "Refunds",
      value: count(cur.length),
      change: change(prev.length, cur.length),
      source: [...new Set(refunds.map((e) => (e.source === "stripe" ? "Stripe" : "Shopify")))].join(
        " & ",
      ),
      higherIsBetter: false,
      comparable: prev.length >= MIN_PREVIOUS_COUNT,
    });
  }

  // Ad spend and return on ad spend (Meta, latest revision per account-day, one currency).
  const adDays = metaAccountDays(input.events, now);
  const adCurrencies = new Set(adDays.map((d) => d.currency));
  if (adDays.length && adCurrencies.size === 1) {
    const [currency] = adCurrencies,
      dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`),
      cur = adDays.filter((d) => dayMs(d.date) >= currentStart && dayMs(d.date) < end),
      prev = adDays.filter((d) => dayMs(d.date) >= previousStart && dayMs(d.date) < currentStart),
      spend = (l: typeof adDays) => sum(l.map((d) => d.spend)),
      value = (l: typeof adDays) => sum(l.map((d) => d.purchaseValue ?? 0)),
      roas = (l: typeof adDays) => (spend(l) > 0 ? value(l) / spend(l) : 0);
    metrics.push({
      key: "adSpend",
      group: "Marketing",
      label: "Ad spend",
      value: money(spend(cur), currency),
      change: change(spend(prev), spend(cur)),
      source: "Meta Ads",
      higherIsBetter: null,
      comparable: prev.length >= MIN_PREVIOUS_COUNT,
    });
    if (value(cur) > 0 || value(prev) > 0)
      metrics.push({
        key: "roas",
        group: "Marketing",
        label: "Return on ad spend",
        value: `${roas(cur).toFixed(2)}×`,
        change: roas(prev) > 0 ? change(roas(prev), roas(cur)) : null,
        source: "Meta Ads (reported)",
        higherIsBetter: true,
        comparable: prev.length >= MIN_PREVIOUS_COUNT && value(prev) > 0,
      });
  }

  // Facebook Page: followers at the end of each period, and people reached.
  const pageDays = ofType("meta_social.facebook.performance.daily_recorded");
  if (pageDays.length) {
    const metric = (e: IntelligenceEvent, key: string) =>
        num((meta(e, "metrics") as Record<string, unknown> | undefined)?.[key]),
      newest = (list: IntelligenceEvent[]) =>
        [...list].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0],
      cur = pageDays.filter(inCurrent),
      prev = pageDays.filter(inPrevious),
      followersNow = cur.length ? metric(newest(cur), "followers") : null,
      followersBefore = prev.length ? metric(newest(prev), "followers") : null;
    if (followersNow !== null)
      metrics.push({
        key: "followers",
        group: "Marketing",
        label: "Facebook followers",
        value: count(followersNow),
        change: followersBefore !== null ? change(followersBefore, followersNow) : null,
        source: "Facebook",
        higherIsBetter: true,
        comparable: followersBefore !== null,
      });
    const reach = (l: IntelligenceEvent[]) =>
      sum(l.map((e) => metric(e, "page_total_media_view_unique") ?? 0));
    metrics.push({
      key: "reach",
      group: "Marketing",
      label: "People reached",
      value: count(reach(cur)),
      change: prev.length ? change(reach(prev), reach(cur)) : null,
      source: "Facebook",
      higherIsBetter: true,
      comparable: prev.length >= MIN_PREVIOUS_COUNT && reach(prev) > 0,
    });
  }

  // Google search clicks (Search Console weekly summaries ending in each period).
  const searches = ofType("google_search_console.performance_summary");
  if (searches.length) {
    const clicks = (l: IntelligenceEvent[]) => sum(l.map((e) => num(meta(e, "clicks")) ?? 0)),
      cur = searches.filter(inCurrent),
      prev = searches.filter(inPrevious);
    metrics.push({
      key: "searchClicks",
      group: "Marketing",
      label: "Google search clicks",
      value: count(clicks(cur)),
      change: prev.length ? change(clicks(prev), clicks(cur)) : null,
      source: "Search Console",
      higherIsBetter: true,
      comparable: prev.length > 0 && clicks(prev) >= MIN_PREVIOUS_COUNT,
    });
  }

  // Mailchimp: subscribers across audiences at the end of each period (newest snapshot per
  // audience), and the average open rate of campaigns whose results settled in the period.
  const audienceDays = ofType("mailchimp.audience.daily_recorded");
  if (audienceDays.length) {
    const total = (list: IntelligenceEvent[]) => {
        const latest = new Map<string, IntelligenceEvent>();
        for (const e of list) {
          const id = String(meta(e, "audienceId") ?? "");
          const seen = latest.get(id);
          if (!seen || e.occurredAt > seen.occurredAt) latest.set(id, e);
        }
        return latest.size
          ? sum([...latest.values()].map((e) => num(meta(e, "subscribers")) ?? 0))
          : null;
      },
      now = total(audienceDays.filter(inCurrent)),
      before = total(audienceDays.filter(inPrevious));
    if (now !== null)
      metrics.push({
        key: "emailSubscribers",
        group: "Marketing",
        label: "Email subscribers",
        value: count(now),
        change: before !== null ? change(before, now) : null,
        source: "Mailchimp",
        higherIsBetter: true,
        comparable: before !== null,
      });
  }
  const campaignResults = ofType("mailchimp.campaign.results_recorded");
  if (campaignResults.length) {
    const average = (list: IntelligenceEvent[]) =>
        list.length ? sum(list.map((e) => num(meta(e, "openRate")) ?? 0)) / list.length : null,
      cur = campaignResults.filter(inCurrent),
      prev = campaignResults.filter(inPrevious),
      now = average(cur),
      before = average(prev);
    if (now !== null)
      metrics.push({
        key: "campaignOpenRate",
        group: "Marketing",
        label: "Campaign open rate",
        value: `${now.toFixed(1)}%`,
        change: before ? change(before, now) : null,
        source: `Mailchimp, ${cur.length} campaign${cur.length === 1 ? "" : "s"}`,
        higherIsBetter: true,
        comparable: before !== null && before > 0,
      });
  }

  const activity: [keyof ActivityCounts, string, string, boolean | null][] = [
    ["emails", "New emails", "Gmail and Outlook", null],
    ["meetings", "Meetings booked", "Google Calendar", null],
    ["deployments", "Deployments", "GitHub", null],
    ["failedBuilds", "Failed builds", "GitHub", false],
  ];
  for (const [key, label, source, higherIsBetter] of activity) {
    const c = input.counts[key];
    if (!c || (c.current === 0 && c.previous === 0)) continue;
    metrics.push({
      key,
      group: "Operations",
      label,
      value: count(c.current),
      change: change(c.previous, c.current),
      source,
      higherIsBetter,
      comparable: c.previous >= MIN_PREVIOUS_COUNT,
    });
  }
  return metrics;
}

/** Plain-English "going well" and "needs a look" lines from the metrics. */
export function highlights(metrics: Metric[], period: Period): Highlight[] {
  const out: Highlight[] = [],
    previous = PERIOD_LABEL[period].previous,
    byKey = new Map(metrics.map((m) => [m.key, m]));
  const spend = byKey.get("adSpend"),
    roas = byKey.get("roas");
  const spendUpReturnDown =
    spend?.comparable && roas?.comparable && (spend.change ?? 0) >= 20 && (roas.change ?? 0) <= -20;
  if (spendUpReturnDown)
    out.push({
      tone: "bad",
      text: `Ad spend up ${Math.round(spend!.change!)}% but return on ad spend fell ${Math.abs(Math.round(roas!.change!))}% compared with ${previous}`,
    });
  for (const m of metrics) {
    if (!m.comparable || m.change === null || m.higherIsBetter === null) continue;
    if (spendUpReturnDown && m.key === "roas") continue;
    if (Math.abs(m.change) < HIGHLIGHT_PERCENT) continue;
    const up = m.change > 0;
    out.push({
      tone: up === m.higherIsBetter ? "good" : "bad",
      text: `${m.label} ${up ? "up" : "down"} ${Math.abs(Math.round(m.change))}% to ${m.value} compared with ${previous}`,
    });
  }
  return out;
}

/**
 * Measures that held roughly level (within the highlight threshold) where up is good, so a quiet
 * period still shows what is holding up rather than an empty "Going well".
 */
export function steadyLines(metrics: Metric[], limit = 3): string[] {
  return metrics
    .filter(
      (m) =>
        m.comparable &&
        m.change !== null &&
        m.higherIsBetter === true &&
        Math.abs(m.change) < HIGHLIGHT_PERCENT,
    )
    .slice(0, limit)
    .map((m) => {
      const c = Math.round(m.change!);
      return c === 0
        ? `${m.label} steady at ${m.value}`
        : `${m.label} steady at ${m.value} (${c > 0 ? "up" : "down"} ${Math.abs(c)}%)`;
    });
}
