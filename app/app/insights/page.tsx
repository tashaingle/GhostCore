import Link from "next/link";
import {RefreshCw, Sparkles} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {runIntelligenceAction} from "@/app/intelligence-actions";
import {Notice} from "@/components/notice";
import {InsightCard} from "@/components/home-ui";

export const metadata = {title: "Insights"};

const severityRank = (s: string) => ({critical: 0, warning: 1, info: 2, good: 3})[s] ?? 4;
const views = [
  {key: "active", label: "Current", statuses: ["active", "acknowledged"]},
  {key: "closed", label: "Resolved & dismissed", statuses: ["resolved", "dismissed"]},
] as const;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  const view = views.find((v) => v.key === params.view) ?? views[0];
  const {data, error} = await ctx.supabase
    .from("insights")
    .select("id,title,summary,severity,rule_id,updated_at")
    .eq("organisation_id", ctx.organisation.id)
    .in("status", [...view.statuses])
    .order("updated_at", {ascending: false})
    .limit(100);
  const insights =
    view.key === "active"
      ? [...(data ?? [])].sort(
          (a, b) =>
            severityRank(a.severity) - severityRank(b.severity) ||
            b.updated_at.localeCompare(a.updated_at),
        )
      : (data ?? []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Insights</h1>
          <p className="mt-2 max-w-2xl text-base text-zinc-500">
            Changes Metric Mage noticed across your sales, payments, ads and website, with what to
            do about each one. Updated every hour.
          </p>
        </div>
        <form action={runIntelligenceAction}>
          <input type="hidden" name="returnTo" value="/app/insights" />
          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-950">
            <RefreshCw aria-hidden className="h-4 w-4" />
            Refresh now
          </button>
        </form>
      </header>

      <Notice searchParams={params} />

      <nav aria-label="Insight views" className="inline-flex rounded-xl bg-zinc-200/60 p-1">
        {views.map((v) => (
          <Link
            key={v.key}
            href={v.key === "active" ? "/app/insights" : `/app/insights?view=${v.key}`}
            aria-current={v.key === view.key ? "page" : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              v.key === view.key
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="error">Insights could not be loaded. Please try again shortly.</p>
      ) : insights.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-zinc-200 bg-white/60 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
            <Sparkles aria-hidden className="h-6 w-6" />
          </span>
          <p className="mt-4 font-medium text-zinc-900">
            {view.key === "active" ? "Nothing to report right now" : "No closed insights yet"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {view.key === "active"
              ? "Metric Mage checks your connected tools every hour. When something changes, like orders dropping or a payment dispute, it will appear here."
              : "Insights you resolve or dismiss will be kept here for reference."}
          </p>
        </div>
      )}
    </div>
  );
}
