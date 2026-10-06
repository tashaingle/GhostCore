import {metadataNumber} from "./helpers";
import type {IntelligenceEvent, RuleContext} from "./types";

const DAY_MS = 86_400_000;

export const contextNow = (context?: RuleContext) => context?.now ?? new Date();

/** Two back-to-back rolling windows ending at `now`: [previous][current]. */
export function comparisonWindows(now: Date, days: number) {
  const end = now.getTime(),
    currentStart = end - days * DAY_MS,
    previousStart = currentStart - days * DAY_MS;
  return {previousStart, currentStart, end};
}

export const occurredMs = (event: IntelligenceEvent) => new Date(event.occurredAt).getTime();

export const within = (event: IntelligenceEvent, start: number, end: number) => {
  const t = occurredMs(event);
  return t >= start && t < end;
};

/** Percentage change from `previous` to `current`, rounded to one decimal place. */
export const percentChange = (previous: number, current: number) =>
  previous === 0
    ? current === 0
      ? 0
      : Infinity
    : Math.round(((current - previous) / previous) * 1000) / 10;

/**
 * True when the source has data from before `since`. Week-on-week rules require this so a
 * newly connected (or truncated) history is never mistaken for a decline.
 */
export const coversSince = (events: IntelligenceEvent[], since: number) =>
  events.some((event) => occurredMs(event) <= since);

/** ISO-8601 week label such as "2026-W40"; scopes recurring insights to one per week. */
export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1),
    week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const groupBy = <T>(items: T[], key: (item: T) => string | null) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k !== null) groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
};

export const metadataString = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" && value ? value : null;
};

const numeric = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export type MetaAccountDay = {
  event: IntelligenceEvent;
  accountId: string;
  currency: string;
  date: string;
  spend: number;
  purchases: number | null;
  purchaseValue: number | null;
};

/**
 * Account-level Meta Ads days, keeping only the most recently recorded revision of each
 * account/day (Meta revises attributed results after the fact). Today's partial day is excluded.
 */
export function metaAccountDays(events: IntelligenceEvent[], now: Date): MetaAccountDay[] {
  const today = now.toISOString().slice(0, 10),
    latest = new Map<string, MetaAccountDay>();
  for (const event of events) {
    if (event.eventType !== "meta_ads.performance.daily_recorded") continue;
    const m = event.metadata,
      accountId = metadataString(m, "sourceAccountId"),
      date = metadataString(m, "reportingDate"),
      currency = metadataString(m, "currency"),
      metrics = (m.metrics ?? {}) as Record<string, unknown>,
      micros = metrics.spendMicros;
    if (m.sourceEntityType !== "account" || !accountId || !date || !currency || date >= today)
      continue;
    const spend =
      typeof micros === "string" && /^-?\d+$/.test(micros)
        ? Number(BigInt(micros)) / 1_000_000
        : numeric(metrics.spend);
    if (spend === null) continue;
    const day: MetaAccountDay = {
        event,
        accountId,
        currency,
        date,
        spend,
        purchases: numeric(metrics.attributedPurchases),
        purchaseValue: numeric(metrics.attributedPurchaseValue),
      },
      key = `${accountId}|${date}`,
      existing = latest.get(key);
    if (!existing || (event.recordedAt ?? "") > (existing.event.recordedAt ?? ""))
      latest.set(key, day);
  }
  return [...latest.values()];
}

/**
 * Google Ads account days in the same shape, keeping the latest revision of each account/day
 * (Google updates conversions for several days). Conversions stand in for purchases.
 */
export function googleAdsAccountDays(events: IntelligenceEvent[], now: Date): MetaAccountDay[] {
  const today = now.toISOString().slice(0, 10),
    latest = new Map<string, MetaAccountDay>();
  for (const event of events) {
    if (event.eventType !== "google_ads.performance.daily_recorded") continue;
    const m = event.metadata,
      accountId = metadataString(m, "sourceAccountId"),
      date = metadataString(m, "reportingDate"),
      currency = metadataString(m, "currency"),
      metrics = (m.metrics ?? {}) as Record<string, unknown>,
      micros = metrics.spendMicros;
    if (!accountId || !date || !currency || date >= today) continue;
    const spend =
      typeof micros === "string" && /^\d+$/.test(micros)
        ? Number(BigInt(micros)) / 1_000_000
        : numeric(metrics.spend);
    if (spend === null) continue;
    const day: MetaAccountDay = {
        event,
        accountId,
        currency,
        date,
        spend,
        purchases: numeric(metrics.conversions),
        purchaseValue: numeric(metrics.conversionsValue),
      },
      key = `${accountId}|${date}`,
      existing = latest.get(key);
    if (!existing || (event.recordedAt ?? "") > (existing.event.recordedAt ?? ""))
      latest.set(key, day);
  }
  return [...latest.values()];
}

/** Splits Meta account days into the last `days` complete dates and the `days` before them. */
export function splitMetaDays(days: MetaAccountDay[], now: Date, windowDays: number) {
  const date = (offset: number) =>
      new Date(now.getTime() - offset * DAY_MS).toISOString().slice(0, 10),
    currentStart = date(windowDays),
    previousStart = date(windowDays * 2);
  return {
    current: days.filter((d) => d.date >= currentStart),
    previous: days.filter((d) => d.date >= previousStart && d.date < currentStart),
    previousStart,
  };
}

export const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

export {metadataNumber};
