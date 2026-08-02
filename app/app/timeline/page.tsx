import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {parseEventFilters, periodStart} from "@/lib/events/filters";
import {EVENT_CATEGORIES, EVENT_SEVERITIES} from "@/types/events";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {EmptyState} from "@/components/empty-state";
import {SeverityBadge} from "@/components/severity-badge";
import {mergeTimelineItems, type TimelineItem} from "@/lib/intelligence/timeline";
import {
  humanEventLabel,
  isLowSignalEventType,
  providerLabel,
} from "@/lib/ui/labels";

const PAGE = 25;

export default async function Timeline({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseEventFilters(params);
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;

  const rawView = typeof params.view === "string" ? params.view : "everything";
  const view = ["events", "insights", "correlations", "everything"].includes(rawView)
    ? rawView
    : "everything";
  const showNoise = params.noise === "1";

  let eventQuery = ctx.supabase
    .from("events")
    .select(
      "id,source,category,event_type,title,description,severity,occurred_at,metadata",
    )
    .eq("organisation_id", ctx.organisation.id)
    .order("occurred_at", {ascending: false})
    .limit(PAGE * (filters.page + 2));

  if (filters.severity) eventQuery = eventQuery.eq("severity", filters.severity);
  if (filters.category) eventQuery = eventQuery.eq("category", filters.category);
  if (filters.source) eventQuery = eventQuery.ilike("source", `%${filters.source}%`);
  if (filters.q) {
    const q = filters.q.replace(/[%(),]/g, "");
    eventQuery = eventQuery.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (filters.period !== "all") {
    eventQuery = eventQuery.gte("occurred_at", periodStart(filters.period));
  }

  let insightQuery = ctx.supabase
    .from("insights")
    .select("id,title,summary,severity,status,confidence,updated_at")
    .eq("organisation_id", ctx.organisation.id)
    .order("updated_at", {ascending: false})
    .limit(PAGE * (filters.page + 1));

  if (filters.severity) insightQuery = insightQuery.eq("severity", filters.severity);
  if (filters.q) {
    const q = filters.q.replace(/[%(),]/g, "");
    insightQuery = insightQuery.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
  }
  if (filters.period !== "all") {
    insightQuery = insightQuery.gte("updated_at", periodStart(filters.period));
  }

  const correlationQuery = ctx.supabase
    .from("event_correlations")
    .select(
      "id,relationship_type,strength,score,source_provider,target_provider,occurred_at,rule_key,rule_version",
    )
    .eq("organisation_id", ctx.organisation.id)
    .eq("active", true)
    .neq("strength", "weak")
    .order("occurred_at", {ascending: false})
    .limit(PAGE * (filters.page + 1));

  const [eventsResult, insightsResult, correlationsResult] = await Promise.all([
    ["insights", "correlations"].includes(view)
      ? Promise.resolve({data: [], error: null})
      : eventQuery,
    ["events", "correlations"].includes(view)
      ? Promise.resolve({data: [], error: null})
      : insightQuery,
    ["events", "insights"].includes(view)
      ? Promise.resolve({data: [], error: null})
      : correlationQuery,
  ]);

  const rawEvents = eventsResult.data ?? [];
  const hiddenNoise = showNoise
    ? 0
    : rawEvents.filter((event) => isLowSignalEventType(event.event_type)).length;

  const events: TimelineItem[] = rawEvents
    .filter((event) => showNoise || !isLowSignalEventType(event.event_type))
    .map((event) => {
      const metadata =
        event.metadata &&
        typeof event.metadata === "object" &&
        !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : {};
      return {
        id: event.id,
        kind: "event" as const,
        title: event.title,
        summary: event.description,
        severity: event.severity,
        timestamp: event.occurred_at,
        href:
          event.event_type.startsWith("notification.") && metadata.notificationId
            ? `/app/action-centre/${metadata.notificationId}`
            : undefined,
        label: humanEventLabel(event.source, event.category, event.event_type),
      };
    });

  const insights: TimelineItem[] = (insightsResult.data ?? []).map((insight) => ({
    id: insight.id,
    kind: "insight" as const,
    title: insight.title,
    summary: insight.summary,
    severity: insight.severity,
    timestamp: insight.updated_at,
    href: `/app/insights/${insight.id}`,
    label: `Insight · ${insight.status} · ${insight.confidence}% confidence`,
  }));

  const correlations: TimelineItem[] = (correlationsResult.data ?? []).map(
    (item) => ({
      id: item.id,
      kind: "correlation" as const,
      title: `${providerLabel(item.source_provider)} linked with ${providerLabel(item.target_provider)}`,
      summary: `${item.relationship_type.replaceAll("_", " ")} matched by ${item.rule_key} v${item.rule_version}. This is a correlation, not proof of cause.`,
      severity:
        item.strength === "confirmed" || item.strength === "strong"
          ? "good"
          : "info",
      timestamp: item.occurred_at,
      href: `/app/correlations/${item.id}`,
      label: `Correlation · score ${item.score} · ${item.strength}`,
    }),
  );

  const merged = mergeTimelineItems(
    events,
    insights,
    correlations,
    PAGE * (filters.page + 1),
  );
  const items = merged.slice((filters.page - 1) * PAGE, filters.page * PAGE);
  const hasNext = merged.length > filters.page * PAGE;

  const url = (page: number, overrides: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (typeof v === "string") p.set(k, v);
    });
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v));
    p.set("page", String(page));
    return `?${p}`;
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title="Timeline"
        description="What happened across your connected tools - insights first, noise optional."
      />
      <Notice searchParams={params} />

      <form className="card grid gap-3 md:grid-cols-6">
        <input
          className="field md:col-span-2"
          name="q"
          placeholder="Search titles and summaries"
          defaultValue={filters.q}
        />
        <select className="field" name="view" defaultValue={view}>
          <option value="everything">Everything</option>
          <option value="insights">Insights only</option>
          <option value="events">Events only</option>
          <option value="correlations">Correlations only</option>
        </select>
        <select className="field" name="severity" defaultValue={filters.severity ?? ""}>
          <option value="">All severities</option>
          {EVENT_SEVERITIES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select className="field" name="category" defaultValue={filters.category ?? ""}>
          <option value="">All categories</option>
          {EVENT_CATEGORIES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select className="field" name="period" defaultValue={filters.period}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        <input className="field" name="source" placeholder="Source (e.g. stripe)" defaultValue={filters.source} />
        <label className="flex items-center gap-2 text-sm text-zinc-600 md:col-span-2">
          <input type="checkbox" name="noise" value="1" defaultChecked={showNoise} />
          Show routine noise (pushes, discount updates)
        </label>
        <button className="button md:col-span-4 md:justify-self-start">Apply filters</button>
      </form>

      {!showNoise && hiddenNoise > 0 ? (
        <p className="info-banner">
          Hiding {hiddenNoise} routine events (for example git pushes and discount
          updates).{" "}
          <Link className="font-semibold underline" href={url(1, {noise: "1"})}>
            Show them
          </Link>
        </p>
      ) : null}

      {eventsResult.error || insightsResult.error || correlationsResult.error ? (
        <p className="error">The timeline could not be loaded. Try again in a moment.</p>
      ) : !items.length ? (
        <EmptyState
          title="Nothing to show yet"
          description="Connect a tool and run Sync, or widen your filters. Insights appear after Ghost analyses imported events."
          actionHref="/app/integrations"
          actionLabel="Go to integrations"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const card = (
              <article
                className={`card card-interactive ${
                  item.kind === "insight"
                    ? "border-violet-200 bg-violet-50/40"
                    : item.kind === "correlation"
                      ? "border-sky-200 bg-sky-50/40"
                      : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.kind !== "event" ? (
                    <span className="badge badge-insight">{item.kind}</span>
                  ) : null}
                  <SeverityBadge value={item.severity} />
                  <h3 className="font-semibold">{item.title}</h3>
                  <time className="ml-auto text-xs text-zinc-500">
                    {new Date(item.timestamp).toLocaleString()}
                  </time>
                </div>
                {item.summary ? (
                  <p className="mt-2 text-sm text-zinc-700">{item.summary}</p>
                ) : null}
                <p className="mt-3 text-xs text-zinc-500">{item.label}</p>
              </article>
            );

            return item.href ? (
              <Link className="block" href={item.href} key={`${item.kind}-${item.id}`}>
                {card}
              </Link>
            ) : (
              <div key={`${item.kind}-${item.id}`}>{card}</div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between text-sm">
        {filters.page > 1 ? (
          <Link className="nav-link" href={url(filters.page - 1)}>
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {hasNext ? (
          <Link className="nav-link" href={url(filters.page + 1)}>
            Next →
          </Link>
        ) : null}
      </div>
    </section>
  );
}
