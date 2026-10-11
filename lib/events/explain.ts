/**
 * Turns a stored event into plain English for people: a headline with the real figures, a line
 * of detail, and for anything that needs attention, what to do about it and where. Works on past
 * events too, so older entries read as well as new ones.
 */

export type ExplainableEvent = {
  source: string;
  event_type: string;
  title: string;
  description?: string | null;
  severity: string;
  metadata?: unknown;
};

export type Explained = {
  title: string;
  detail: string | null;
  status: "good" | "info" | "warning" | "critical";
  /** What it means and what to do, for things that need a look. */
  advice?: string;
  action?: {label: string; href: string};
};

type Meta = Record<string, unknown>;
const meta = (e: ExplainableEvent): Meta =>
  e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
    ? (e.metadata as Meta)
    : {};
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const count = (n: number) => Math.round(n).toLocaleString("en-GB");
const plural = (n: number, word: string, many = `${word}s`) =>
  `${count(n)} ${Math.round(n) === 1 ? word : many}`;

/** "2026-10-10" or a timestamp → "10 Oct" (with the year only if it's not this year). */
export function shortDate(value: unknown, now = new Date()) {
  const text = str(value);
  if (!text) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00Z` : text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getUTCFullYear() === now.getUTCFullYear() ? {} : {year: "numeric"}),
    timeZone: "UTC",
  });
}
const range = (start: unknown, end: unknown) => {
  const a = shortDate(start),
    b = shortDate(end);
  return a && b ? `${a} – ${b}` : (a ?? b);
};
/** Any ISO dates left in older titles become "10 Oct". */
export const humaniseDates = (text: string) =>
  text.replace(/\b(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z?)?\b/g, (iso) => shortDate(iso) ?? iso);

const money = (amount: number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);

const searchConsole = (m: Meta, report: "performance" | "sitemaps" | "inspect") => {
  const property = str(m.propertyUrl);
  if (!property) return undefined;
  const resource = encodeURIComponent(property);
  const href =
    report === "performance"
      ? `https://search.google.com/search-console/performance/search-analytics?resource_id=${resource}`
      : report === "sitemaps"
        ? `https://search.google.com/search-console/sitemaps?resource_id=${resource}`
        : `https://search.google.com/search-console/inspect?resource_id=${resource}`;
  return {label: "Open Search Console", href};
};
const site = (m: Meta) =>
  str(m.propertyUrl)
    ?.replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
const shopifyAdmin = (m: Meta, path: string) => {
  const shop = str(m.shop);
  return shop ? {label: "Open in Shopify", href: `https://${shop}/admin/${path}`} : undefined;
};
const repoName = (m: Meta) => str(m.repository)?.split("/").pop() ?? "your repository";
/** Shopify titles look like "Discount Spring sale · active"; this takes the name back out. */
const discountName = (title: string) =>
  title
    .replace(/^Discount\s+/, "")
    .replace(/\s*·?\s*(unknown|active|expired|scheduled)$/i, "")
    .trim() || "A discount";

const status = (severity: string): Explained["status"] =>
  severity === "good" || severity === "warning" || severity === "critical" ? severity : "info";

type Handler = (e: ExplainableEvent, m: Meta) => Explained;

const HANDLERS: Record<string, Handler> = {
  "meta_social.facebook.performance.daily_recorded": (e, m) => {
    const metrics = (m.metrics ?? {}) as Meta,
      name = str(m.sourceEntityName) ?? "Your Page",
      reach = num(metrics.page_total_media_view_unique) ?? 0,
      followers = num(metrics.followers),
      follows = num(metrics.page_daily_follows) ?? 0,
      engagements = num(metrics.page_post_engagements) ?? 0,
      day = shortDate(m.reportingDate);
    return {
      title:
        reach > 0
          ? `${name} on Facebook: ${plural(reach, "person", "people")} reached`
          : `${name} on Facebook: ${followers !== null ? plural(followers, "follower") : "daily figures"}`,
      detail: `${day ? `On ${day}: ` : ""}${plural(follows, "new follower")}, ${plural(engagements, "engagement")}${followers !== null ? `, ${count(followers)} followers in total` : ""}.`,
      status: "info",
    };
  },
  "meta_ads.performance.daily_recorded": (e, m) => {
    const metrics = (m.metrics ?? {}) as Meta,
      currency = str(m.currency) ?? "GBP",
      spend = num(metrics.spend) ?? 0,
      clicks = num(metrics.clicks) ?? 0,
      reach = num(metrics.reach) ?? 0,
      day = shortDate(m.reportingDate);
    return {
      title: `Meta Ads: ${money(spend, currency)} spent, ${plural(clicks, "click")}`,
      detail: `${day ? `On ${day}: ` : ""}reached ${plural(reach, "person", "people")}${num(metrics.linkClicks) !== null ? `, ${plural(num(metrics.linkClicks)!, "link click")}` : ""}.`,
      status: "info",
    };
  },
  "google_search_console.performance_summary": (e, m) => {
    const clicks = num(m.clicks) ?? 0,
      impressions = num(m.impressions) ?? 0,
      position = num(m.averagePosition),
      when = range(m.currentStart, m.currentEnd);
    return {
      title: `Google search: ${plural(clicks, "click")} to ${site(m) ?? "your site"}`,
      detail: impressions
        ? `${when ? `${when}: ` : ""}your site appeared in Google ${plural(impressions, "time")}${position ? ` at an average position of ${position.toFixed(0)}` : ""}.`
        : `${when ? `${when}: ` : ""}your site didn't appear in Google results yet.`,
      status: "info",
    };
  },
  "google_search_console.position_declined": (e, m) => {
    const now = num(m.currentPosition),
      before = num(m.previousPosition);
    return {
      title: `${site(m) ?? "Your site"} slipped in Google rankings`,
      detail:
        now && before
          ? `Average position went from ${before.toFixed(0)} to ${now.toFixed(0)} (lower numbers are better), ${range(m.currentStart, m.currentEnd)}.`
          : null,
      status: "warning",
      advice:
        "In Search Console's Performance report, sort by position to see which searches dropped, then update those pages: fresher content, clearer titles and answering the question near the top usually help.",
      action: searchConsole(m, "performance"),
    };
  },
  "google_search_console.position_improved": (e, m) => {
    const now = num(m.currentPosition),
      before = num(m.previousPosition);
    return {
      title: `${site(m) ?? "Your site"} climbed in Google rankings`,
      detail:
        now && before
          ? `Average position went from ${before.toFixed(0)} to ${now.toFixed(0)}, ${range(m.currentStart, m.currentEnd)}.`
          : null,
      status: "good",
    };
  },
  "google_search_console.clicks_decreased": (e, m) => ({
    title: `Fewer people found ${site(m) ?? "your site"} on Google`,
    detail: `Clicks fell from ${count(num(m.previousClicks) ?? 0)} to ${count(num(m.currentClicks) ?? 0)}${num(m.percentageChange) !== null ? ` (${Math.round(num(m.percentageChange)!)}%)` : ""}, ${range(m.currentStart, m.currentEnd)}.`,
    status: "warning",
    advice:
      "Check Search Console's Performance report for the pages and searches that lost the most clicks. A big sudden drop can mean pages were removed, redirected or blocked; a gradual one usually means competitors overtook you.",
    action: searchConsole(m, "performance"),
  }),
  "google_search_console.clicks_increased": (e, m) => ({
    title: `More people found ${site(m) ?? "your site"} on Google`,
    detail: `Clicks rose from ${count(num(m.previousClicks) ?? 0)} to ${count(num(m.currentClicks) ?? 0)}, ${range(m.currentStart, m.currentEnd)}.`,
    status: "good",
  }),
  "google_search_console.page_indexed": (e, m) => ({
    title: `Google indexed ${str(m.pagePath) ?? "a page"}`,
    detail: `It can now appear in Google search results${site(m) ? ` for ${site(m)}` : ""}.`,
    status: "good",
  }),
  "google_search_console.page_not_indexed": (e, m) => {
    const state = str(m.coverageState) ?? "";
    const redirect = /redirect/i.test(state);
    return {
      title: `Google isn't indexing ${str(m.pagePath) ?? "a page"}`,
      detail: state ? `Google says: "${state}".` : null,
      status: redirect ? "info" : "warning",
      advice: redirect
        ? "This address redirects somewhere else, so Google indexes the page it redirects to instead. That's usually fine: nothing to do unless this page should have its own place in search."
        : "Open the URL Inspection tool in Search Console to see why. Common causes are a 'noindex' tag, the page being blocked, or Google thinking it's a duplicate. Fix the cause, then click 'Request indexing'.",
      action: searchConsole(m, "inspect"),
    };
  },
  "google_search_console.sitemap_warnings": (e, m) => ({
    title: `Google found a problem with your sitemap`,
    detail: `${str(m.sitemapPath) ?? "Your sitemap"} on ${site(m) ?? "your site"} has ${plural(num(m.warnings) ?? 0, "warning")} and ${plural(num(m.errors) ?? 0, "error")}.`,
    status: "warning",
    advice:
      "Open Sitemaps in Search Console and click the sitemap to see which entries Google flagged. It's often a page that redirects or is blocked. Usually your website or SEO plugin can fix it by regenerating the sitemap.",
    action: searchConsole(m, "sitemaps"),
  }),
  "google_search_console.sitemap_processed": (e, m) => ({
    title: `Google read your sitemap`,
    detail: `${str(m.sitemapPath) ?? "Your sitemap"} on ${site(m) ?? "your site"} was processed with no problems.`,
    status: "info",
  }),
  "analytics.landing_page_declined": (e) => ({
    title: `Fewer visits to ${humaniseDates(e.title.replace(/^Landing page traffic declined:\s*/, "")) || "a page"}`,
    detail: e.description ?? null,
    status: "warning",
    advice:
      "Check the page still loads properly on a phone, and whether something that sent people there changed: an ad that ended, a link that was removed, or a drop in Google rankings.",
    action: {label: "Open Google Analytics", href: "https://analytics.google.com/"},
  }),
  "analytics.organic_traffic_changed": (e, m) => {
    const up = (num(m.percentageChange) ?? 0) >= 0;
    return {
      title: `Visits from Google search ${up ? "rose" : "fell"}`,
      detail: `${count(num(m.previousValue) ?? 0)} → ${count(num(m.currentValue) ?? 0)} visits, ${range(m.currentPeriodStart, m.currentPeriodEnd)}.`,
      status: up ? "good" : "warning",
      ...(up
        ? {}
        : {
            advice:
              "See which pages lost visits in Google Analytics, then check those pages in Search Console's Performance report for ranking drops.",
            action: {label: "Open Google Analytics", href: "https://analytics.google.com/"},
          }),
    };
  },
  "stripe.checkout_expired": () => ({
    title: "A customer didn't finish paying",
    detail: "They started checkout but didn't pay before it expired.",
    status: "info",
    advice:
      "One or two is normal. If it keeps happening, try your checkout on a phone and check delivery costs and payment options aren't putting people off.",
    action: {label: "Open Stripe", href: "https://dashboard.stripe.com/checkout/sessions"},
  }),
  "stripe.payout_paid": (e, m) => ({
    title: `${money((num(m.amountMinor) ?? 0) / 100, str(m.currency) ?? "GBP")} paid into your bank`,
    detail: m.arrivalDate
      ? `Stripe payout, arrived ${shortDate(m.arrivalDate)}.`
      : "Stripe payout.",
    status: "good",
  }),
  "stripe.payout_created": (e, m) => ({
    title: `${money((num(m.amountMinor) ?? 0) / 100, str(m.currency) ?? "GBP")} on its way to your bank`,
    detail: m.arrivalDate ? `Stripe payout, due ${shortDate(m.arrivalDate)}.` : "Stripe payout.",
    status: "info",
  }),
  "shopify.discount_created": (e, m) => ({
    title: `New discount: ${discountName(e.title)}`,
    detail:
      range(m.startsAt, m.endsAt) ??
      (str(m.startsAt) ? `Starts ${shortDate(m.startsAt)}, no end date.` : "No dates set."),
    status: "info",
  }),
  "shopify.discount_expired": (e, m) => ({
    title: `Discount ended: ${discountName(e.title)}`,
    detail: range(m.startsAt, m.endsAt) ? `It ran ${range(m.startsAt, m.endsAt)}.` : null,
    status: "info",
    action: shopifyAdmin(m, "discounts"),
  }),
  "shopify.inventory_out_of_stock": (e, m) => ({
    title: humaniseDates(e.title),
    detail: "Customers can't buy it until it's back in stock.",
    status: "critical",
    advice:
      "Restock it, or turn on 'Continue selling when out of stock' if you can still fulfil orders. If it's discontinued, archive it so customers don't land on a dead end.",
    action: shopifyAdmin(m, m.productId ? `products/${String(m.productId)}` : "products"),
  }),
  "shopify.product_active": (e, m) => ({
    title: `${e.title.replace(/\s+active$/i, "")} is on sale in your shop`,
    detail: num(m.totalInventory) !== null ? `${count(num(m.totalInventory)!)} in stock.` : null,
    status: "info",
  }),
  "shopify.product_archived": (e) => ({
    title: `${e.title.replace(/\s+archived$/i, "")} was archived`,
    detail: "It's no longer shown in your shop.",
    status: "info",
  }),
  "shopify.product_unpublished": (e) => ({
    title: `${e.title.replace(/\s+draft$/i, "")} is now a draft`,
    detail: "It's hidden from your shop until you publish it.",
    status: "info",
  }),
  "workflow.failed": (e, m) => {
    const cancelled = str(m.conclusion) === "cancelled";
    return {
      title: cancelled
        ? `${e.title.replace(/\s+failed$/i, "")} was cancelled`
        : `${e.title.replace(/\s+failed$/i, "")} failed`,
      detail: `In ${repoName(m)}${str(m.branch) ? ` on ${str(m.branch)}` : ""}.`,
      status: cancelled ? "info" : "critical",
      ...(cancelled
        ? {}
        : {
            advice: "Open the run on GitHub to see which step failed and why.",
            action: str(m.url) ? {label: "Open on GitHub", href: str(m.url)!} : undefined,
          }),
    };
  },
  "workflow.success": (e, m) => ({
    title: humaniseDates(e.title),
    detail: `In ${repoName(m)}${str(m.branch) ? ` on ${str(m.branch)}` : ""}.`,
    status: "good",
  }),
  "git.push": (e, m) => ({
    title: `Code pushed to ${str(m.branch) ?? "a branch"} in ${repoName(m)}`,
    detail: str(m.actor) ? `By ${str(m.actor)}.` : null,
    status: "info",
  }),
  "pull_request.opened": (e, m) => ({
    title: `Pull request${num(m.number) ? ` #${num(m.number)}` : ""} opened in ${repoName(m)}`,
    detail: str(m.actor) ? `By ${str(m.actor)}.` : null,
    status: "info",
  }),
  "vercel.deployment.failed": (e, m) => ({
    title: `A website update failed to go live${str(m.project) ? ` (${str(m.project)})` : ""}`,
    detail: "Your site is still running the previous version.",
    status: "critical",
    advice: "Open the deployment to read the error, fix it, and push again.",
    action: str(m.url) ? {label: "Open the deployment", href: str(m.url)!} : undefined,
  }),
  "mailchimp.audience.daily_recorded": (e, m) => ({
    title: `${str(m.audienceName) ?? "Your audience"}: ${plural(num(m.subscribers) ?? 0, "subscriber")}`,
    detail: e.description ?? null,
    status: "info",
  }),
};

export function explainEvent(e: ExplainableEvent): Explained {
  const handler = HANDLERS[e.event_type];
  if (handler) {
    const explained = handler(e, meta(e));
    return {...explained, title: humaniseDates(explained.title)};
  }
  return {
    title: humaniseDates(e.title),
    detail: e.description ? humaniseDates(e.description) : null,
    status: status(e.severity),
  };
}
