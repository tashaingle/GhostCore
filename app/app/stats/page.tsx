import Link from "next/link";
import {ChartNoAxesCombined} from "lucide-react";
import {BusinessPicker} from "@/components/business-picker";
import {TrendChart} from "@/components/charts/trend-chart";
import {formatValue} from "@/components/charts/format";
import {TrendChip} from "@/components/home-ui";
import {PERIOD_DAYS, PERIOD_LABEL, parsePeriod, type Period} from "@/lib/home/performance";
import {sortProjects} from "@/lib/home/projects";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {STATS_EVENT_TYPES, statsSections, type StatChart} from "@/lib/stats/stats";

export const metadata = {title: "Stats"};

const DAY = 86_400_000;
const PERIODS: {key: Period; label: string}[] = [
  {key: "week", label: "Week"},
  {key: "month", label: "Month"},
  {key: "year", label: "Year"},
];
const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  const period = parsePeriod(params.period);
  const projects = sortProjects(ctx.organisations);
  const project =
    projects.find((item) => item.id === params.project) ??
    projects.find((item) => item.id === ctx.organisation.id) ??
    projects[0];
  const now = new Date();
  const {data: rows} = await ctx.supabase
    .from("events")
    .select("id,source,event_type,title,occurred_at,created_at,metadata")
    .eq("organisation_id", project.id)
    .in("event_type", STATS_EVENT_TYPES)
    .gte("occurred_at", new Date(now.getTime() - 2 * PERIOD_DAYS[period] * DAY).toISOString())
    .limit(20000);
  const events: IntelligenceEvent[] = (rows ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    eventType: e.event_type,
    title: e.title,
    description: null,
    severity: "info",
    occurredAt: e.occurred_at,
    recordedAt: e.created_at,
    metadata:
      e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
        ? (e.metadata as Record<string, unknown>)
        : {},
  }));
  const sections = statsSections({events, period, now});
  const labels = PERIOD_LABEL[period];
  const href = (next: {project?: string; period?: Period}) => {
    const query = new URLSearchParams();
    const chosenProject = next.project ?? project.id;
    const chosenPeriod = next.period ?? period;
    if (chosenProject !== ctx.organisation.id) query.set("project", chosenProject);
    if (chosenPeriod !== "week") query.set("period", chosenPeriod);
    const text = query.toString();
    return text ? `/app/stats?${text}` : "/app/stats";
  };

  return (
    <div className="mm-page mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Stats</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Website, social media, sales and Shopping, {labels.current} against {labels.previous}.
          </p>
        </div>
        <nav aria-label="Period" className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={href({period: p.key})}
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
      </header>

      <BusinessPicker
        businesses={projects}
        selectedId={project.id}
        href={(id) => href({project: id ?? undefined})}
      />

      {sections.length ? (
        sections.map((section) => (
          <section key={section.key} aria-labelledby={`stats-${section.key}`} className="space-y-3">
            <h2 id={`stats-${section.key}`} className="text-lg font-semibold text-zinc-950">
              {section.title}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.charts.map((chart) => (
                <StatCard
                  key={`${chart.key}-${period}-${project.id}`}
                  chart={chart}
                  current={capital(labels.current)}
                  previous={capital(labels.previous)}
                />
              ))}
              {section.sources?.length ? <Sources sources={section.sources} /> : null}
            </div>
          </section>
        ))
      ) : (
        <div className="mm-panel flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
          <ChartNoAxesCombined aria-hidden className="h-8 w-8 text-zinc-300" />
          <p className="font-medium text-zinc-900">No stats for {project.name} yet</p>
          <p className="max-w-md text-sm text-zinc-500">
            Connect Google Analytics, Search Console, Facebook, Stripe, Merchant Center or Mailchimp
            and the graphs will fill in as the data arrives.
          </p>
          <Link href="/app/integrations" className="button mt-1">
            Connect a tool
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  chart,
  current,
  previous,
}: {
  chart: StatChart;
  current: string;
  previous: string;
}) {
  return (
    <TrendChart
      trend={chart.trend}
      label={chart.label}
      currentLabel={current}
      previousLabel={previous}
      headline={
        <div>
          <p className="text-sm font-medium text-zinc-600">
            {chart.label} <span className="text-zinc-400">· {chart.source}</span>
          </p>
          <p className="mt-1 flex items-center gap-2.5">
            <span className="text-3xl font-semibold tracking-tight text-zinc-950">
              {formatValue(chart.value, chart.trend.unit)}
            </span>
            <TrendChip change={chart.change} higherIsBetter={!chart.lowerIsBetter} />
          </p>
          {chart.note ? <p className="mt-1 text-xs text-zinc-400">{chart.note}</p> : null}
        </div>
      }
    />
  );
}

function Sources({sources}: {sources: {label: string; value: number}[]}) {
  const total = sources.reduce((sum, item) => sum + item.value, 0);
  return (
    <article className="mm-panel rounded-2xl p-5">
      <p className="text-sm font-medium text-zinc-600">
        Where visitors came from <span className="text-zinc-400">· Google Analytics</span>
      </p>
      <p className="mt-1 text-xs text-zinc-400">Latest 7 days</p>
      <ul className="mt-4 space-y-3">
        {sources.slice(0, 8).map((item) => {
          const share = total ? (item.value / total) * 100 : 0;
          return (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-zinc-800">{item.label}</span>
                <span className="tabular-nums text-zinc-500">
                  {item.value.toLocaleString("en-GB")} · {Math.round(share)}%
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-zinc-100">
                <div
                  className="h-2 rounded-full bg-[#1d66b8]"
                  style={{width: `${Math.max(share, 1)}%`}}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
