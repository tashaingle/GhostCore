import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {
  googleAdsAccountDays,
  metaAccountDays,
  percentChange,
  sum,
  type MetaAccountDay,
} from "@/lib/intelligence/windows";
import {PERIOD_DAYS, PERIOD_LABEL, type Highlight, type Metric, type Period} from "./performance";

/**
 * Joins the dots across tools: when a figure falls, checks what else changed over the same days
 * (ads, Google search, the website, payments, emails, tracking) and what held steady, then says
 * which is the most likely reason. It only ever says "likely": it sees what happened at the same
 * time, not what caused what.
 */

/** Extra events the checks need, loaded alongside the figures. */
export const WHY_EVENT_TYPES = [
  "analytics.tracking_inactive",
  "google_search_console.position_declined",
  "google_search_console.page_dropped",
  "google_search_console.page_not_indexed",
  "vercel.deployment.failed",
  "vercel.deployment.ready",
  "github.deployment_failed",
  "stripe.payment_failed",
  "stripe.checkout_expired",
  "mailchimp.campaign.sent",
];

type Action = {label: string; href: string};
/** Something seen in another tool over the same days. */
export type Clue = {
  verdict: "changed" | "normal";
  /** A sentence fragment: "your Meta ads stopped spending on Tuesday 6 Oct". */
  text: string;
  /** How it's named in "so … is the most likely reason", or in a list of what was normal. */
  name: string;
  /** How well it would explain the drop, 0–100. */
  weight: number;
  advice?: string;
  action?: Action;
  /** The events it's based on, kept as evidence. */
  eventIds?: string[];
};
export type Why = {likely: Clue[]; possible: Clue[]; normal: Clue[]; text: string};

export type WhyContext = Context;
type Context = {
  events: IntelligenceEvent[];
  metrics: Map<string, Metric>;
  currentStart: number;
  previousStart: number;
  end: number;
  now: Date;
  period: Period;
};
type Check = (ctx: Context) => Clue | null;

const DAY = 86_400_000;
/** A clue at least this strong is called the likely reason. */
const LIKELY = 50;

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const count = (n: number) => Math.round(n).toLocaleString("en-GB");
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount >= 10 ? 0 : 2,
    maximumFractionDigits: amount >= 10 ? 0 : 2,
  }).format(amount);
/** "Tuesday 6 Oct". */
const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
const at = (e: IntelligenceEvent) => Date.parse(e.occurredAt);
const steady = (change: number | null) => change !== null && Math.abs(change) < 10;
const comparable = (m: Metric | undefined): m is Metric & {change: number} =>
  !!m && m.comparable && m.change !== null && Number.isFinite(m.change);
/** Events in this period; causes can start a little before the drop shows. */
const recent = (ctx: Context, types: string[], leadDays = 0) =>
  ctx.events.filter(
    (e) =>
      types.includes(e.eventType) && at(e) >= ctx.currentStart - leadDays * DAY && at(e) < ctx.end,
  );
const earlier = (ctx: Context, types: string[]) =>
  ctx.events.filter(
    (e) => types.includes(e.eventType) && at(e) >= ctx.previousStart && at(e) < ctx.currentStart,
  );

/** Ads that stopped, or spent a lot less, in this period. */
const ads: Check = (ctx) => {
  const platforms: [string, MetaAccountDay[], Action][] = [
    [
      "Meta",
      metaAccountDays(ctx.events, ctx.now),
      {label: "Open Meta Ads Manager", href: "https://adsmanager.facebook.com/"},
    ],
    [
      "Google",
      googleAdsAccountDays(ctx.events, ctx.now),
      {label: "Open Google Ads", href: "https://ads.google.com/"},
    ],
  ];
  const clues = platforms.flatMap(([platform, days, action]): Clue[] => {
    const currencies = new Set(days.map((d) => d.currency));
    if (!days.length || currencies.size !== 1) return [];
    const [currency] = currencies,
      dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`),
      byDate = new Map<string, number>();
    for (const d of days) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.spend);
    const dated = [...byDate].map(([date, spend]) => ({t: dayMs(date), spend})),
      before = dated.filter((d) => d.t >= ctx.previousStart && d.t < ctx.currentStart),
      now = dated.filter((d) => d.t >= ctx.currentStart && d.t < ctx.end).sort((a, b) => a.t - b.t);
    if (before.length < 3 || !now.length) return [];
    const spendBefore = sum(before.map((d) => d.spend)),
      spendNow = sum(now.map((d) => d.spend)),
      dailyBefore = spendBefore / before.length;
    if (spendBefore <= 0) return [];
    const eventIds = days.filter((d) => dayMs(d.date) >= ctx.currentStart).map((d) => d.event.id);
    // Stopped: from some day on, every day spent under a fifth of the usual amount.
    const stoppedAt = now.findIndex((_, i) =>
      now.slice(i).every((d) => d.spend < dailyBefore * 0.2),
    );
    const advice = `In ${platform === "Meta" ? "Meta Ads Manager" : "Google Ads"}, check whether the ads were paused, ran out of budget, had a payment fail or were rejected.`;
    if (stoppedAt >= 0)
      return [
        {
          verdict: "changed",
          text: `your ${platform} ads ${stoppedAt === 0 ? "weren't running" : `stopped spending on ${day(now[stoppedAt].t)}`} (usually about ${money(dailyBefore, currency)} a day)`,
          name: `the ${platform} ads stopping`,
          weight: 90,
          advice,
          action,
          eventIds,
        },
      ];
    const change = percentChange(spendBefore, spendNow);
    if (change <= -30)
      return [
        {
          verdict: "changed",
          text: `your ${platform} ads spent ${Math.round(-change)}% less (${money(spendNow, currency)}, down from ${money(spendBefore, currency)})`,
          name: `the drop in ${platform} ad spend`,
          weight: change <= -50 ? 75 : 55,
          advice,
          action,
          eventIds,
        },
      ];
    if (steady(change))
      return [
        {
          verdict: "normal",
          text: `your ${platform} ads ran as usual`,
          name: `${platform} ads`,
          weight: 0,
        },
      ];
    return [];
  });
  return clues.sort((a, b) => b.weight - a.weight)[0] ?? null;
};

/** Fewer clicks from Google, or pages that slipped or dropped out. */
const search: Check = (ctx) => {
  const clicks = ctx.metrics.get("searchClicks"),
    slipped = recent(
      ctx,
      [
        "google_search_console.position_declined",
        "google_search_console.page_dropped",
        "google_search_console.page_not_indexed",
      ],
      2,
    ),
    action = {label: "Open Search Console", href: "https://search.google.com/search-console"};
  if (comparable(clicks) && clicks.change <= -20)
    return {
      verdict: "changed",
      text: `clicks from Google search fell ${Math.abs(Math.round(clicks.change))}%${slipped.length ? `, and Google moved some of your pages down or dropped them` : ""}`,
      name: "the drop in Google search",
      weight: slipped.length ? 75 : 60,
      advice:
        "In Search Console, open Performance and compare the two weeks to see which searches and pages lost clicks.",
      action,
      eventIds: slipped.map((e) => e.id),
    };
  if (comparable(clicks) && steady(clicks.change) && !slipped.length)
    return {verdict: "normal", text: "Google search was normal", name: "Google search", weight: 0};
  if (slipped.length >= 2)
    return {
      verdict: "changed",
      text: `Google moved ${slipped.length} of your pages down or dropped them`,
      name: "your Google rankings slipping",
      weight: 40,
      advice: "Search Console shows which pages moved and why.",
      action,
      eventIds: slipped.map((e) => e.id),
    };
  return null;
};

/** Pages Google moved down or dropped, for a drop in search clicks. */
const rankings: Check = (ctx) => {
  const slipped = recent(
    ctx,
    [
      "google_search_console.position_declined",
      "google_search_console.page_dropped",
      "google_search_console.page_not_indexed",
    ],
    2,
  );
  if (!slipped.length) return null;
  return {
    verdict: "changed",
    text: `Google moved ${slipped.length === 1 ? "one of your pages" : `${slipped.length} of your pages`} down or dropped ${slipped.length === 1 ? "it" : "them"}`,
    name: "your Google rankings slipping",
    weight: slipped.length >= 2 ? 65 : 50,
    advice:
      "In Search Console, open Performance and compare the two weeks to see which pages lost clicks, then check those pages still load and haven't changed.",
    action: {label: "Open Search Console", href: "https://search.google.com/search-console"},
    eventIds: slipped.map((e) => e.id),
  };
};

/** Visits from Google search specifically (Analytics), for a drop in visits. */
const searchVisits: Check = (ctx) => {
  const summaries = recent(ctx, ["analytics.performance_summary"]);
  if (ctx.period !== "week" || !summaries.length) return search(ctx);
  const channel = (key: string) =>
      sum(
        summaries.map(
          (e) =>
            num((e.metadata[key] as Record<string, unknown> | undefined)?.["Organic Search"]) ?? 0,
        ),
      ),
    now = channel("currentChannels"),
    before = channel("previousChannels");
  if (before < 20) return search(ctx);
  const change = percentChange(before, now);
  if (change <= -20)
    return {
      verdict: "changed",
      text: `visits from Google search fell ${Math.round(-change)}% (${count(now)}, down from ${count(before)})`,
      name: "fewer people finding you on Google",
      weight: change <= -40 ? 75 : 60,
      advice:
        "In Search Console, open Performance and compare the two weeks to see which searches and pages lost clicks.",
      action: {label: "Open Search Console", href: "https://search.google.com/search-console"},
    };
  if (steady(change))
    return {
      verdict: "normal",
      text: "visits from Google were normal",
      name: "Google search",
      weight: 0,
    };
  return null;
};

/** Fewer people visiting, for a drop in sales or conversions. */
const visits: Check = (ctx) => {
  const v = ctx.metrics.get("visits");
  if (!comparable(v)) return null;
  if (v.change <= -20)
    return {
      verdict: "changed",
      text: `fewer people visited your website (down ${Math.abs(Math.round(v.change))}%)`,
      name: "fewer people visiting",
      weight: 60,
      advice:
        "In Google Analytics, open Reports → Acquisition to see which source of visitors dropped.",
      action: {label: "Open Google Analytics", href: "https://analytics.google.com/"},
    };
  if (steady(v.change))
    return {
      verdict: "normal",
      text: "website visits were normal",
      name: "website visits",
      weight: 0,
    };
  return null;
};

/** A failed deploy that could have broken the website. */
const website: Check = (ctx) => {
  const failed = recent(ctx, ["vercel.deployment.failed", "github.deployment_failed"], 2),
    shipped = recent(ctx, ["vercel.deployment.ready"]);
  if (failed.length) {
    const first = Math.min(...failed.map(at));
    return {
      verdict: "changed",
      text: `${failed.length === 1 ? "an update to your website failed" : `${failed.length} updates to your website failed`}, starting ${day(first)}`,
      name: "the failed website update",
      weight: 55,
      advice: "Open your website on a phone and a computer to check it loads and checkout works.",
      action: {label: "Open Vercel", href: "https://vercel.com/dashboard"},
      eventIds: failed.map((e) => e.id),
    };
  }
  if (shipped.length)
    return {
      verdict: "normal",
      text: "website updates went through fine",
      name: "website updates",
      weight: 0,
    };
  return null;
};

/** Payments failing or checkouts abandoned more than usual. */
const payments: Check = (ctx) => {
  const types = ["stripe.payment_failed", "stripe.checkout_expired"],
    failures = recent(ctx, types),
    now = failures.length,
    before = earlier(ctx, types).length;
  if (now >= 3 && now >= before * 2)
    return {
      verdict: "changed",
      text: `${now} payments failed or weren't finished${before ? `, up from ${before}` : ""}`,
      name: "payments failing",
      weight: 70,
      advice:
        "In Stripe, open Payments and filter by Failed to see why: card declines, a payment method that stopped working, or customers leaving at checkout.",
      action: {
        label: "Open Stripe",
        href: "https://dashboard.stripe.com/payments?status[0]=failed",
      },
      eventIds: failures.map((e) => e.id),
    };
  if (now <= Math.max(1, before) && ctx.events.some((e) => e.source === "stripe"))
    return {verdict: "normal", text: "payments went through as usual", name: "payments", weight: 0};
  return null;
};

/** Marketing emails that went out last time but not this time. */
const emails: Check = (ctx) => {
  const now = recent(ctx, ["mailchimp.campaign.sent"]).length,
    sent = earlier(ctx, ["mailchimp.campaign.sent"]),
    before = sent.length;
  if (before > 0 && now === 0)
    return {
      verdict: "changed",
      text: `you sent ${before === 1 ? "an email" : `${before} emails`} to customers ${PERIOD_LABEL[ctx.period].previous} but none ${PERIOD_LABEL[ctx.period].current}`,
      name: "not sending an email",
      weight: 45,
      advice: "If your emails usually bring people in, sending one again should help.",
      action: {label: "Open Mailchimp", href: "https://admin.mailchimp.com/campaigns/"},
      eventIds: sent.map((e) => e.id),
    };
  return null;
};

/** Fewer people seeing your Facebook posts. */
const social: Check = (ctx) => {
  const reach = ctx.metrics.get("reach");
  if (comparable(reach) && reach.change <= -30)
    return {
      verdict: "changed",
      text: `fewer people saw your Facebook posts (down ${Math.abs(Math.round(reach.change))}%)`,
      name: "fewer people seeing your posts",
      weight: 30,
    };
  return null;
};

/** Analytics no longer recording: the drop may not be real. */
const tracking: Check = (ctx) => {
  const silent = recent(ctx, ["analytics.tracking_inactive"], 2);
  return silent.length
    ? {
        verdict: "changed",
        text: "Google Analytics stopped recording visits altogether",
        name: "tracking stopping",
        weight: 95,
        advice:
          "This is probably a measuring problem rather than a real drop. Check the Google Analytics code is still on every page of your website.",
        action: {label: "Open Google Analytics", href: "https://analytics.google.com/"},
        eventIds: silent.map((e) => e.id),
      }
    : null;
};

/** Conversions gone to nothing while people still visit: usually the tracking, not customers. */
const conversionTracking: Check = (ctx) => {
  const c = ctx.metrics.get("conversions"),
    v = ctx.metrics.get("visits");
  if (comparable(c) && c.change <= -99 && comparable(v) && v.change > -30)
    return {
      verdict: "changed",
      text: "no conversions were recorded at all, while people still visited",
      name: "conversion tracking stopping",
      weight: 85,
      advice:
        "This usually means the tracking broke rather than customers stopping. Try your sign-up or checkout yourself, then check Google Analytics shows it.",
      action: {label: "Open Google Analytics", href: "https://analytics.google.com/"},
    };
  return null;
};

/** Which checks matter for each figure. */
const CHECKS: Record<string, Check[]> = {
  revenue: [ads, payments, website, visits, search, emails],
  orders: [ads, payments, website, visits, search, emails],
  conversions: [tracking, conversionTracking, ads, website, visits, search, emails],
  visits: [tracking, ads, searchVisits, website, emails, social],
  searchClicks: [website, rankings],
};

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What else changed when `key` fell, or null when there isn't enough to go on. */
export function explainDrop(key: string, ctx: Context): Why | null {
  const checks = CHECKS[key];
  if (!checks) return null;
  const clues = checks.map((check) => check(ctx)).filter((clue): clue is Clue => clue !== null),
    changed = clues.filter((c) => c.verdict === "changed").sort((a, b) => b.weight - a.weight),
    normal = clues.filter((c) => c.verdict === "normal"),
    strong = changed.filter((c) => c.weight >= LIKELY),
    // Two strong clues close together are both named; otherwise the strongest one.
    likely = strong.filter((c) => c.weight >= (strong[0]?.weight ?? 0) - 10).slice(0, 2),
    possible = changed.filter((c) => !likely.includes(c)),
    normalNames = list(normal.map((c) => c.name));
  if (!changed.length && !normal.length) return null;

  let text: string;
  if (likely.length === 2)
    text = `Two things changed at the same time: ${likely[0].text}, and ${likely[1].text}. Either could be the reason.`;
  else if (likely.length === 1)
    text = `${capital(likely[0].text)}${normal.length ? `, while ${normalNames} ${normal.length === 1 ? "was" : "were"} normal` : ""}, so ${likely[0].name} is the most likely reason.`;
  else if (possible.length)
    text = `Nothing clearly explains it. Possibly related: ${list(possible.map((c) => c.text))}.`;
  else
    text = `Nothing in your other tools changed at the same time: ${normalNames} ${normal.length === 1 ? "was" : "were all"} normal.`;
  if (likely.length && possible.length) text += ` Also: ${list(possible.map((c) => c.text))}.`;
  return {likely, possible, normal, text};
}

/** The shared view of one period that the checks look at. */
export function whyContext(input: {
  metrics: Metric[];
  events: IntelligenceEvent[];
  period: Period;
  now?: Date;
}): Context {
  const now = input.now ?? new Date(),
    end = now.getTime(),
    currentStart = end - PERIOD_DAYS[input.period] * DAY;
  return {
    events: input.events,
    metrics: new Map(input.metrics.map((m) => [m.key, m])),
    currentStart,
    previousStart: currentStart - PERIOD_DAYS[input.period] * DAY,
    end,
    now,
    period: input.period,
  };
}

/** Adds "why" (and a better "what to do") to each "needs a look" highlight. */
export function explainHighlights(input: {
  highlights: Highlight[];
  metrics: Metric[];
  events: IntelligenceEvent[];
  period: Period;
  now?: Date;
}): Highlight[] {
  const ctx = whyContext(input);
  return input.highlights.map((h) => {
    if (h.tone !== "bad" || !h.key) return h;
    const why = explainDrop(h.key, ctx);
    if (!why) return h;
    const lead = why.likely[0];
    // With no clear reason and visitors steady, the problem is on the site rather than finding it.
    const steadyVisitors =
      !lead &&
      ["orders", "revenue", "conversions"].includes(h.key) &&
      why.normal.some((c) => c.name === "website visits");
    return {
      ...h,
      why: why.text,
      ...(lead?.advice ? {tip: lead.advice} : {}),
      ...(steadyVisitors
        ? {
            tip: "People still came to your website but fewer bought. Check your checkout works, and whether prices, delivery costs or stock changed.",
          }
        : {}),
      ...(lead?.action ? {action: lead.action} : {}),
    };
  });
}
