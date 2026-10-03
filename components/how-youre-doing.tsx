import Link from "next/link";
import {CircleCheck, TriangleAlert} from "lucide-react";
import {TrendChip} from "@/components/home-ui";
import {Sparkline} from "@/components/charts/sparkline";
import {TrendChart, type ChartNote} from "@/components/charts/trend-chart";
import {
  PERIOD_LABEL,
  steadyLines,
  type Highlight,
  type Metric,
  type MetricGroup,
  type Period,
} from "@/lib/home/performance";

const PERIODS: {key: Period; label: string}[] = [
  {key: "week", label: "Week"},
  {key: "month", label: "Month"},
  {key: "year", label: "Year"},
];
const GROUPS: MetricGroup[] = ["Money", "Marketing", "Operations"];
/** Which figure leads the main chart: the first of these with something to draw. */
const HEADLINE = ["revenue", "orders", "emailSubscribers", "reach", "adSpend", "followers"];
const hasShape = (m: Metric) =>
  Boolean(m.trend && [...m.trend.current, ...m.trend.previous].some((v) => (v ?? 0) > 0));

export function HowYoureDoing({
  period,
  metrics,
  highlights,
  updates,
  healthy = [],
  notes = [],
}: {
  period: Period;
  metrics: Metric[];
  highlights: Highlight[];
  updates: number;
  /** Good news about the organisation's setup, e.g. all connections working. */
  healthy?: string[];
  /** Things Metric Mage noticed this period, marked on the main chart. */
  notes?: ChartNote[];
}) {
  const good = highlights.filter((h) => h.tone === "good"),
    bad = highlights.filter((h) => h.tone === "bad"),
    labels = PERIOD_LABEL[period],
    comparable = metrics.some((m) => m.comparable),
    // Improvements first, then healthy basics, then whatever is holding steady.
    goingWell = [
      ...good.map((h) => h.text),
      ...healthy,
      ...(good.length ? [] : steadyLines(metrics)),
    ],
    nextPeriod = period === "week" ? "Month" : period === "month" ? "Year" : null,
    headline = HEADLINE.map((key) => metrics.find((m) => m.key === key)).find((m): m is Metric =>
      Boolean(m && hasShape(m)),
    ),
    capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

  return (
    <section aria-label="How you're doing" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            How you&apos;re doing
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {`${labels.current[0].toUpperCase()}${labels.current.slice(1)} compared with ${labels.previous}.`}
          </p>
        </div>
        <nav aria-label="Period" className="inline-flex rounded-xl bg-zinc-200/60 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "week" ? "/app" : `/app?period=${p.key}`}
              scroll={false}
              aria-current={p.key === period ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                p.key === period
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {metrics.length || healthy.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-5">
            <h3 className="flex items-center gap-2 font-medium text-emerald-900">
              <CircleCheck aria-hidden className="h-[18px] w-[18px]" />
              Going well
            </h3>
            {goingWell.length ? (
              <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                {goingWell.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            ) : null}
            {!comparable && metrics.length ? (
              <p className="mt-3 text-sm text-emerald-900/70">
                {`Metric Mage compares with ${labels.previous} once it has data from then.`}
                {nextPeriod ? " Your tools may have more history: " : null}
                {nextPeriod ? (
                  <Link
                    className="font-medium underline"
                    href={`/app?period=${nextPeriod.toLowerCase()}`}
                    scroll={false}
                  >
                    {`try ${nextPeriod}`}
                  </Link>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-5">
            <h3 className="flex items-center gap-2 font-medium text-amber-900">
              <TriangleAlert aria-hidden className="h-[18px] w-[18px]" />
              Needs a look
            </h3>
            {bad.length ? (
              <ul className="mt-3 space-y-2 text-sm text-amber-950">
                {bad.map((h) => (
                  <li key={h.text}>{h.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-amber-900/70">
                {comparable
                  ? `Nothing has dropped by 10% or more since ${labels.previous}.`
                  : "Nothing to flag yet."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {headline?.trend ? (
        <TrendChart
          key={`${headline.key}-${period}`}
          trend={headline.trend}
          label={`${headline.label} ${labels.current}`}
          currentLabel={capital(labels.current)}
          previousLabel={capital(labels.previous)}
          notes={notes}
        />
      ) : null}

      {GROUPS.map((group) => {
        const items = metrics.filter((m) => m.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <h3 className="mb-2 text-sm font-medium text-zinc-500">{group}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((m) => (
                <article
                  key={m.key}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-900/[0.03]"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-600">{m.label}</p>
                    <p className="truncate text-xs text-zinc-400">{m.source}</p>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-zinc-950">
                        {m.value}
                      </p>
                      <div className="mt-2">
                        <TrendChip change={m.change} higherIsBetter={m.higherIsBetter} />
                      </div>
                    </div>
                    {m.trend && hasShape(m) ? (
                      <Sparkline key={period} trend={m.trend} label={m.label} />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        );
      })}

      {!metrics.length ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-5 py-6 text-sm text-zinc-500">
          Connect Stripe, Shopify, Meta Ads, Facebook, Search Console, Gmail, Calendar or GitHub to
          see how your business is doing here.
        </p>
      ) : null}

      <p className="text-xs text-zinc-400">
        {`${updates.toLocaleString("en-GB")} updates imported from your tools ${labels.current}.`}
      </p>
    </section>
  );
}
