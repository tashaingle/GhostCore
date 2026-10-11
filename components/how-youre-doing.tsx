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
const GROUPS: MetricGroup[] = ["Money", "Marketing", "Customers", "Operations"];
/** Soft tints say which area a figure belongs to, never whether it's good or bad. */
const TINT: Record<MetricGroup, string> = {
  Money: "bg-[#e7eefc]",
  Marketing: "bg-[#fbe9ec]",
  Customers: "bg-[#fdf0e1]",
  Operations: "bg-[#e3f4ee]",
};
/** Which figure leads the main chart: the first of these with something to draw. */
const CHART_ORDER = ["revenue", "orders", "emailSubscribers", "reach", "adSpend", "followers"];
/** The figures shown as the big tiles across the top, in this order of preference. */
const TOP_ORDER = [
  "revenue",
  "orders",
  "adSpend",
  "emailSubscribers",
  "reach",
  "searchClicks",
  "refunds",
  "followers",
];
const TOP_COUNT = 4;

const hasShape = (m: Metric) =>
  Boolean(m.trend && [...m.trend.current, ...m.trend.previous].some((v) => (v ?? 0) > 0));
const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** Splits the figures into the top tiles, the chart's figure, and everything else. */
export function arrangeFigures(metrics: Metric[]) {
  const ranked = [
      ...TOP_ORDER.flatMap((key) => metrics.filter((m) => m.key === key)),
      ...metrics.filter((m) => !TOP_ORDER.includes(m.key)),
    ],
    top = ranked.slice(0, TOP_COUNT),
    chart = CHART_ORDER.map((key) => metrics.find((m) => m.key === key)).find((m): m is Metric =>
      Boolean(m && hasShape(m)),
    );
  return {top, chart, rest: metrics.filter((m) => !top.includes(m))};
}

export function PeriodPills({period}: {period: Period}) {
  return (
    <nav aria-label="Period" className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={p.key === "week" ? "/app" : `/app?period=${p.key}`}
          scroll={false}
          aria-current={p.key === period ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            p.key === period
              ? "bg-white text-zinc-950 shadow-sm"
              : "text-zinc-500 hover:text-zinc-950"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** The big soft tiles across the top: number, change since last period, and a trend line. */
export function FigureTiles({metrics, period}: {metrics: Metric[]; period: Period}) {
  const labels = PERIOD_LABEL[period];
  if (!metrics.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      {metrics.map((m) => (
        <article key={m.key} className={`flex flex-col rounded-3xl p-5 ${TINT[m.group]}`}>
          <p className="text-sm font-medium text-zinc-600">{m.label}</p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-zinc-950">
            {m.value}
          </p>
          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
            <div className="flex flex-col items-start gap-1 text-xs text-zinc-500">
              <span className="whitespace-nowrap">{`vs ${labels.previous}`}</span>
              <span className="rounded-full bg-white/80 shadow-sm">
                <TrendChip change={m.change} higherIsBetter={m.higherIsBetter} />
              </span>
            </div>
            {m.trend && hasShape(m) ? (
              <Sparkline
                key={period}
                trend={m.trend}
                label={m.label}
                className="h-8 w-full min-w-0 max-w-[110px]"
              />
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/** This period against the last for the lead figure, with the period buttons in its header. */
export function MainChart({
  figure,
  period,
  notes,
}: {
  figure: Metric | undefined;
  period: Period;
  notes: ChartNote[];
}) {
  if (!figure?.trend) return null;
  const labels = PERIOD_LABEL[period];
  return (
    <TrendChart
      key={`${figure.key}-${period}`}
      trend={figure.trend}
      label={`${figure.label} report`}
      currentLabel={capital(labels.current)}
      previousLabel={capital(labels.previous)}
      notes={notes}
      actions={<PeriodPills period={period} />}
      headline={
        <div>
          <p className="text-xs text-zinc-500">{capital(labels.current)}</p>
          <p className="mt-1 flex items-center gap-2.5">
            <span className="text-3xl font-semibold tracking-tight text-zinc-950">
              {figure.value}
            </span>
            <TrendChip change={figure.change} higherIsBetter={figure.higherIsBetter} />
          </p>
        </div>
      }
    />
  );
}

/** Going well and Needs a look, as two stacked cards for the side column. */
export function GoingWellCards({
  period,
  metrics,
  highlights,
  healthy = [],
}: {
  period: Period;
  metrics: Metric[];
  highlights: Highlight[];
  healthy?: string[];
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
    nextPeriod = period === "week" ? "Month" : period === "month" ? "Year" : null;
  if (!metrics.length && !healthy.length) return null;
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#e3f4ee] p-5">
        <h2 className="flex items-center gap-2 font-semibold text-emerald-900">
          <CircleCheck aria-hidden className="h-[18px] w-[18px]" />
          Going well
        </h2>
        {goingWell.length ? (
          <ul className="mt-3 space-y-2 text-sm text-emerald-950">
            {goingWell.map((text) => (
              <li key={text} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                />
                {text}
              </li>
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
      </section>
      <section className="rounded-3xl bg-[#fdf0e1] p-5">
        <h2 className="flex items-center gap-2 font-semibold text-amber-900">
          <TriangleAlert aria-hidden className="h-[18px] w-[18px]" />
          Needs a look
        </h2>
        {bad.length ? (
          <ul className="mt-3 space-y-2 text-sm text-amber-950">
            {bad.map((h) => (
              <li key={h.text} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>
                  {h.text}
                  {h.tip ? (
                    <span className="mt-0.5 block text-amber-900/75">{`What to do: ${h.tip}`}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-amber-900/70">
            {comparable
              ? `Nothing has dropped by 10% or more since ${labels.previous}.`
              : "Nothing to flag yet."}
          </p>
        )}
      </section>
    </div>
  );
}

/** Every other figure, grouped, as compact white tiles. */
export function MoreFigures({
  metrics,
  period,
  updates,
}: {
  metrics: Metric[];
  period: Period;
  updates: number;
}) {
  const labels = PERIOD_LABEL[period];
  return (
    <section aria-label="More figures" className="space-y-5">
      {GROUPS.map((group) => {
        const items = metrics.filter((m) => m.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${TINT[group]} ring-1 ring-zinc-300`}
              />
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((m) => (
                <article
                  key={m.key}
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/60"
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
      <p className="text-xs text-zinc-400">
        {`${updates.toLocaleString("en-GB")} updates imported from your tools ${labels.current}.`}
      </p>
    </section>
  );
}
