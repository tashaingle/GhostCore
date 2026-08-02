import Link from "next/link";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {calculateInsightMetrics} from "@/lib/intelligence/dashboard";
import {runIntelligenceAction} from "@/app/intelligence-actions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {GettingStarted} from "@/components/getting-started";
import {SeverityBadge} from "@/components/severity-badge";

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;

  // Default home is Command Centre; keep /app as a lighter summary + getting started.
  if (!params.stay && !params.error && !params.success) {
    redirect("/app/command-centre");
  }

  const orgId = ctx.organisation.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, todayCount, connected, last, insightResult] = await Promise.all([
    ctx.supabase
      .from("events")
      .select("*", {count: "exact", head: true})
      .eq("organisation_id", orgId),
    ctx.supabase
      .from("events")
      .select("*", {count: "exact", head: true})
      .eq("organisation_id", orgId)
      .gte("occurred_at", today.toISOString()),
    ctx.supabase
      .from("integrations")
      .select("*", {count: "exact", head: true})
      .eq("organisation_id", orgId)
      .eq("status", "connected"),
    ctx.supabase
      .from("events")
      .select("occurred_at")
      .eq("organisation_id", orgId)
      .order("occurred_at", {ascending: false})
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("insights")
      .select(
        "id,title,summary,severity,confidence,status,recommendation,resolved_at,updated_at",
      )
      .eq("organisation_id", orgId)
      .order("updated_at", {ascending: false})
      .limit(100),
  ]);

  const insightRows = insightResult.data ?? [];
  const metrics = calculateInsightMetrics(insightRows);
  const cards = [
    ["Total events", total.count ?? 0],
    ["Events today", todayCount.count ?? 0],
    ["Connected tools", connected.count ?? 0],
    ["Active insights", metrics.active],
    ["Critical insights", metrics.critical],
    ["Resolved today", metrics.resolvedToday],
    ["Average confidence", `${metrics.averageConfidence}%`],
    [
      "Last event",
      last.data ? new Date(last.data.occurred_at).toLocaleString() : "No events yet",
    ],
  ];
  const todaysInsights = insightRows
    .filter(
      (row) =>
        row.updated_at >= today.toISOString() &&
        ["active", "acknowledged"].includes(row.status),
    )
    .slice(0, 5);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Overview"
        description={ctx.organisation.name}
        actions={
          <>
            <Link className="button button-secondary" href="/app/command-centre">
              Open Command Centre
            </Link>
            <form action={runIntelligenceAction}>
              <button className="button">Refresh insights</button>
            </form>
          </>
        }
      />
      <Notice searchParams={params} />

      <GettingStarted
        connectedCount={connected.count ?? 0}
        eventCount={total.count ?? 0}
        insightCount={metrics.active}
      />

      {insightResult.error ? (
        <p className="error">
          Insights are unavailable. Make sure the latest database migrations are applied.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article className="card" key={label}>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>

      <article className="card">
        <p className="text-sm text-zinc-500">Top recommendation</p>
        <p className="mt-2 font-medium">{metrics.topRecommendation}</p>
      </article>

      <div>
        <h3 className="text-xl font-semibold">Today&apos;s insights</h3>
        <p className="text-sm text-zinc-500">
          Deterministic findings from your connected tools.
        </p>
      </div>

      {!todaysInsights.length ? (
        <div className="card text-zinc-500">
          No active insights generated today. Sync integrations, then refresh insights.
        </div>
      ) : (
        <div className="grid gap-3">
          {todaysInsights.map((insight) => (
            <Link
              className="card card-interactive block"
              href={`/app/insights/${insight.id}`}
              key={insight.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-insight">Insight</span>
                <SeverityBadge value={insight.severity} />
                <strong>{insight.title}</strong>
                <span className="ml-auto text-sm text-zinc-500">
                  {insight.confidence}% confidence
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700">{insight.summary}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
