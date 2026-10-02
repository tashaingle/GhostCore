import Link from "next/link";
import {CircleCheck, TriangleAlert} from "lucide-react";
import {TrendChip} from "@/components/home-ui";
import {
  PERIOD_LABEL,
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

export function HowYoureDoing({
  period,
  metrics,
  highlights,
  updates,
}: {
  period: Period;
  metrics: Metric[];
  highlights: Highlight[];
  updates: number;
}) {
  const good = highlights.filter((h) => h.tone === "good"),
    bad = highlights.filter((h) => h.tone === "bad"),
    labels = PERIOD_LABEL[period],
    comparable = metrics.some((m) => m.comparable);

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

      {metrics.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-5">
            <h3 className="flex items-center gap-2 font-medium text-emerald-900">
              <CircleCheck aria-hidden className="h-[18px] w-[18px]" />
              Going well
            </h3>
            {good.length ? (
              <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                {good.map((h) => (
                  <li key={h.text}>{h.text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-emerald-900/70">
                {comparable
                  ? `Nothing improved by 10% or more since ${labels.previous}.`
                  : "Ghost needs a bit more history before it can compare."}
              </p>
            )}
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
                  ? `Nothing got worse by 10% or more since ${labels.previous}.`
                  : "Nothing to flag yet."}
              </p>
            )}
          </div>
        </div>
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
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">
                    {m.value}
                  </p>
                  <div className="mt-2">
                    <TrendChip change={m.change} higherIsBetter={m.higherIsBetter} />
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
