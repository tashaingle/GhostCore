import Link from "next/link";
import Image from "next/image";
import {ArrowRight, ArrowUpRight, TrendingDown, TrendingUp} from "lucide-react";
import {getProvider} from "@/lib/integrations/registry";

/** Square icon files in /public/providers. Meta Ads and Meta Social share one mark. */
const PROVIDER_MARKS: Record<string, string> = {
  github: "/providers/github.png",
  gmail: "/providers/gmail.png",
  google_analytics: "/providers/google_analytics.png",
  google_calendar: "/providers/google_calendar.png",
  google_search_console: "/providers/google_search_console.png",
  linkedin: "/providers/linkedin.png",
  mailchimp: "/providers/mailchimp.png",
  meta_ads: "/providers/meta.png",
  meta_social: "/providers/meta.png",
  notion: "/providers/notion.png",
  outlook: "/providers/outlook.png",
  shopify: "/providers/shopify.png",
  slack: "/providers/slack.png",
  stripe: "/providers/stripe.png",
  tiktok: "/providers/tiktok.png",
  vercel: "/providers/vercel.png",
};

/** Small square brand mark for a connected tool. Manual keeps its initials. */
export function ProviderMark({provider, size = "md"}: {provider: string; size?: "sm" | "md"}) {
  const dims = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-[10px]";
  const src = PROVIDER_MARKS[provider];
  if (src) {
    return (
      <span
        aria-hidden
        className={`relative block shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-black/5 ${dims}`}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes={size === "sm" ? "28px" : "36px"}
          className="object-cover"
        />
      </span>
    );
  }
  const p = getProvider(provider);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center font-bold text-white shadow-sm ring-1 ring-black/5 ${dims} ${size === "sm" ? "text-[10px]" : "text-xs"}`}
      style={{background: p?.colour ?? "#52525b"}}
    >
      {p?.icon ?? provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function TrendChip({
  change,
  higherIsBetter,
}: {
  change: number | null;
  higherIsBetter: boolean | null;
}) {
  if (change === null) return <span className="text-xs text-zinc-400">No earlier data</span>;
  const flat = Math.abs(change) < 1,
    up = change > 0,
    tone =
      flat || higherIsBetter === null
        ? "bg-zinc-100 text-zinc-600"
        : up === higherIsBetter
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700",
    Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {flat ? null : <Icon aria-hidden className="h-3.5 w-3.5" />}
      {flat ? "No change" : `${up ? "+" : ""}${Math.round(change)}%`}
    </span>
  );
}

const severityStyles: Record<string, {dot: string; label: string; text: string}> = {
  critical: {dot: "bg-rose-500", label: "Urgent", text: "text-rose-700"},
  warning: {dot: "bg-amber-500", label: "Worth a look", text: "text-amber-700"},
  good: {dot: "bg-emerald-500", label: "Good news", text: "text-emerald-700"},
  info: {dot: "bg-sky-500", label: "For info", text: "text-sky-700"},
};

export function SeverityLabel({severity}: {severity: string}) {
  const s = severityStyles[severity] ?? severityStyles.info;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export type InsightSummary = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  rule_id: string;
  updated_at: string;
};

const ruleSource = (ruleId: string) =>
  ruleId.includes("shopify")
    ? "Shopify"
    : ruleId.includes("stripe")
      ? "Stripe"
      : ruleId.startsWith("advertising.") || ruleId.includes("ad_spend")
        ? "Meta Ads"
        : ruleId.startsWith("analytics.") || ruleId.includes("traffic")
          ? "Website"
          : ruleId.startsWith("github.")
            ? "GitHub"
            : "Metric Mage";

export function InsightCard({insight}: {insight: InsightSummary}) {
  return (
    <Link
      href={`/app/insights/${insight.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/5"
    >
      <div className="flex items-center justify-between gap-3">
        <SeverityLabel severity={insight.severity} />
        <span className="text-xs text-zinc-400">{ruleSource(insight.rule_id)}</span>
      </div>
      <h3 className="mt-2.5 text-[15px] font-semibold leading-snug text-zinc-950">
        {insight.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-600">{insight.summary}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 opacity-80 transition-opacity group-hover:opacity-100">
        What to do
        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function SectionHeading({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950"
        >
          {linkLabel ?? "View all"}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}
