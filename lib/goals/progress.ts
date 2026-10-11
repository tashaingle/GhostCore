/**
 * Monthly goals: how far along this calendar month is towards a target, and whether the pace so
 * far would reach it by the end of the month. Pure, so Home, the Monday email and the mid-month
 * alert all say the same thing.
 */

export const GOAL_METRICS = {
  revenue: {
    label: "Revenue",
    unit: "money",
    sources: "Stripe payments and sales you add yourself",
  },
  orders: {label: "Orders", unit: "count", sources: "Shopify orders"},
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;
export const isGoalMetric = (v: unknown): v is GoalMetric =>
  typeof v === "string" && Object.hasOwn(GOAL_METRICS, v);

export type Goal = {id: string; metric: GoalMetric; target: number; currency: string | null};
/** What happened so far this month, from the connected tools. */
export type GoalData = {
  payments: {at: number; amountMinor: number; currency: string; live: boolean}[];
  manualSales: {at: number; amount: number; currency: string}[];
  orders: {at: number}[];
};
export type GoalStatus = "done" | "early" | "on_track" | "close" | "behind";
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  done: "Reached",
  on_track: "On track",
  close: "Just behind",
  behind: "Behind",
  early: "Too early to tell",
};
/** "About" figures read better rounded: £3,196 → £3,200, £213 → £210. */
const roughly = (n: number) => {
  const step = n >= 1000 ? 100 : n >= 100 ? 10 : 1;
  return Math.round(n / step) * step;
};
export type GoalProgress = {
  goal: Goal;
  label: string;
  monthName: string;
  value: number;
  /** Share of the target reached so far, 0–1 (can exceed 1). */
  reached: number;
  /** Share of the month gone, 0–1: where you'd be at an even pace. */
  elapsed: number;
  /** Where this pace would end the month. */
  projected: number;
  status: GoalStatus;
  /** "£2,100 of £5,000". */
  valueText: string;
  /** One or two plain sentences on whether it's on track and what it would take. */
  summary: string;
  /** Stripe test payments were counted because there are no live ones yet. */
  testMode: boolean;
};

const DAY = 86_400_000;

/** Minutes the time zone is ahead of UTC at a given moment. */
function offsetMinutes(at: number, timeZone: string) {
  const name =
    new Intl.DateTimeFormat("en-US", {timeZone, timeZoneName: "longOffset"})
      .formatToParts(new Date(at))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}
/** Midnight at the start of a local date, as a UTC timestamp. */
function localMidnight(year: number, month: number, timeZone: string) {
  const guess = Date.UTC(year, month, 1);
  return guess - offsetMinutes(guess, timeZone) * 60_000;
}

/** The calendar month containing `now`, in the organisation's time zone. */
export function monthWindow(now: Date, timeZone = "Europe/London") {
  const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "numeric",
    }).formatToParts(now),
    year = Number(parts.find((p) => p.type === "year")?.value),
    month = Number(parts.find((p) => p.type === "month")?.value) - 1,
    start = localMidnight(year, month, timeZone),
    end = localMidnight(month === 11 ? year + 1 : year, (month + 1) % 12, timeZone);
  return {
    start,
    end,
    name: new Date(start + DAY).toLocaleDateString("en-GB", {month: "long", timeZone}),
    lastDay: new Date(end - DAY / 2).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      timeZone,
    }),
  };
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: amount < 100 && !Number.isInteger(amount) ? 2 : 0,
  }).format(amount);
const decimals = (currency: string) =>
  new Intl.NumberFormat("en-GB", {style: "currency", currency}).resolvedOptions()
    .maximumFractionDigits ?? 2;

export function goalProgress(
  goal: Goal,
  data: GoalData,
  now: Date,
  timeZone = "Europe/London",
): GoalProgress {
  const month = monthWindow(now, timeZone),
    inMonth = (at: number) => at >= month.start && at < month.end,
    currency = (goal.currency ?? "GBP").toUpperCase(),
    meta = GOAL_METRICS[goal.metric];
  let value = 0,
    testMode = false;
  if (goal.metric === "revenue") {
    const payments = data.payments.filter(
        (p) => inMonth(p.at) && p.currency.toUpperCase() === currency,
      ),
      live = payments.filter((p) => p.live);
    // Like Home: live payments, or test ones (labelled) before there are any live ones.
    testMode = !live.length && payments.length > 0;
    value =
      (live.length ? live : payments).reduce((t, p) => t + p.amountMinor, 0) /
        10 ** decimals(currency) +
      data.manualSales
        .filter((s) => inMonth(s.at) && s.currency.toUpperCase() === currency)
        .reduce((t, s) => t + s.amount, 0);
  } else value = data.orders.filter((o) => inMonth(o.at)).length;

  const format = (n: number) =>
      meta.unit === "money" ? money(n, currency) : Math.round(n).toLocaleString("en-GB"),
    perDay = (n: number) =>
      meta.unit === "money"
        ? `${money(n, currency)} a day`
        : `${Math.ceil(n).toLocaleString("en-GB")} ${Math.ceil(n) === 1 ? "order" : "orders"} a day`,
    elapsed = Math.min(1, Math.max(0, (now.getTime() - month.start) / (month.end - month.start))),
    projected = elapsed > 0 ? value / elapsed : 0,
    daysLeft = Math.max(1, Math.ceil((month.end - now.getTime()) / DAY)),
    needed = (goal.target - value) / daysLeft,
    status: GoalStatus =
      value >= goal.target
        ? "done"
        : elapsed < 0.2
          ? "early"
          : projected >= goal.target
            ? "on_track"
            : projected >= goal.target * 0.9
              ? "close"
              : "behind";
  const summary = {
    done: `Goal reached for ${month.name}.`,
    early: `It's early in ${month.name}, so it's too soon to say whether you're on track.`,
    on_track: `At this pace you'll reach about ${format(roughly(projected))} by ${month.lastDay}.`,
    close: `At this pace you'll reach about ${format(roughly(projected))}, ${format(roughly(goal.target - projected))} short. About ${perDay(meta.unit === "money" ? roughly(needed) : needed)} for the rest of the month would get you there.`,
    behind: `At this pace you'll reach about ${format(roughly(projected))}, ${format(roughly(goal.target - projected))} short. You'd need about ${perDay(meta.unit === "money" ? roughly(needed) : needed)} for the rest of the month.`,
  }[status];
  return {
    goal,
    label: meta.label,
    monthName: month.name,
    value,
    reached: value / goal.target,
    elapsed,
    projected,
    status,
    valueText: `${format(value)} of ${format(goal.target)}`,
    summary,
    testMode,
  };
}
