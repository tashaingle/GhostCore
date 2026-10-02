import Link from "next/link";
import {ArrowRight, ChevronDown, CircleCheck, Plug, RefreshCw, Sparkles, Stamp} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {getProvider} from "@/lib/integrations/registry";
import {
  connectionStatus,
  sortConnections,
  timeAgo,
  type ConnectionStatus,
} from "@/lib/home/connections";
import {PULSE_EVENT_TYPES, weeklyPulse} from "@/lib/home/pulse";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {runIntelligenceAction} from "@/app/intelligence-actions";
import {Notice} from "@/components/notice";
import {GettingStarted} from "@/components/getting-started";
import {AutoRefresh} from "@/components/auto-refresh";
import {
  InsightCard,
  ProviderMark,
  SectionHeading,
  SeverityLabel,
  TrendChip,
} from "@/components/home-ui";

export const metadata = {title: "Home"};

const DAY_MS = 86_400_000;
const severityRank = (s: string) => ({critical: 0, warning: 1, info: 2, good: 3})[s] ?? 4;
// Connection problems get their own section, and Ghost's own housekeeping is not the user's job.
const HOME_HIDDEN_CATEGORIES = ["background_job", "integration", "credential"];

function greeting(timezone: string | null, now: Date) {
  let hour = now.getUTCHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: timezone ?? "UTC",
      }).format(now),
    );
  } catch {}
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

const VISIBLE_CONNECTIONS = 5;

function BrokenConnection({connection: c}: {connection: ConnectionStatus & {provider: string}}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 sm:flex-nowrap">
      <ProviderMark provider={c.provider} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">
          {c.name}
          {c.account ? <span className="font-normal text-zinc-500"> · {c.account}</span> : null}
        </p>
        <p className="truncate text-sm text-zinc-500">{c.detail}</p>
      </div>
      <span
        className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
          c.state === "expired" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
        }`}
      >
        {c.label}
      </span>
      {c.action ? (
        <Link
          href={c.action.href}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
            c.state === "expired"
              ? "bg-zinc-900 text-white hover:bg-zinc-800"
              : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
          }`}
        >
          {c.action.label}
        </Link>
      ) : null}
    </li>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  const org = ctx.organisation.id,
    now = new Date(),
    weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    fortnightAgo = new Date(now.getTime() - 14 * DAY_MS).toISOString();

  const [
    {data: integrations},
    {data: notifications, count: notificationCount},
    {data: approvals},
    {data: insights, count: insightCount},
    {data: pulseRows},
    {count: activityNow},
    {count: activityBefore},
  ] = await Promise.all([
    ctx.supabase
      .from("integrations")
      .select("id,provider,provider_account_name,status,last_sync_at,last_sync_status,settings")
      .eq("organisation_id", org)
      .neq("status", "disconnected"),
    ctx.supabase
      .from("notifications")
      .select("id,title,summary,severity,category,last_detected_at", {count: "exact"})
      .eq("organisation_id", org)
      .in("status", ["open", "acknowledged"])
      .not("category", "in", `(${HOME_HIDDEN_CATEGORIES.join(",")})`)
      .order("last_detected_at", {ascending: false})
      .limit(40),
    ctx.supabase
      .from("workflow_approvals")
      .select("id,run_id,due_at,created_at")
      .eq("organisation_id", org)
      .eq("status", "pending")
      .or(`approver_user_id.eq.${ctx.user.id},approver_role.eq.${ctx.membership.role}`)
      .order("created_at", {ascending: false})
      .limit(5),
    ctx.supabase
      .from("insights")
      .select("id,title,summary,severity,rule_id,updated_at", {count: "exact"})
      .eq("organisation_id", org)
      .in("status", ["active", "acknowledged"])
      .order("updated_at", {ascending: false})
      .limit(30),
    ctx.supabase
      .from("events")
      .select("id,source,event_type,title,occurred_at,created_at,metadata")
      .eq("organisation_id", org)
      .in("event_type", PULSE_EVENT_TYPES)
      .gte("occurred_at", fortnightAgo)
      .limit(5000),
    ctx.supabase
      .from("events")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", org)
      .gte("occurred_at", weekAgo),
    ctx.supabase
      .from("events")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", org)
      .gte("occurred_at", fortnightAgo)
      .lt("occurred_at", weekAgo),
  ]);

  const connections = sortConnections(
      (integrations ?? []).map((row) => ({
        ...connectionStatus(row, getProvider(row.provider), now),
        provider: row.provider,
      })),
    ) as (ReturnType<typeof connectionStatus> & {provider: string})[],
    broken = connections.filter((c) => c.needsAttention),
    healthyCount = connections.length - broken.length;

  const workflowNames = new Map<string, string>();
  if (approvals?.length) {
    const {data: runs} = await ctx.supabase
      .from("workflow_runs")
      .select("id,workflow_id")
      .eq("organisation_id", org)
      .in(
        "id",
        approvals.map((a) => a.run_id),
      );
    const {data: workflows} = runs?.length
      ? await ctx.supabase
          .from("workflow_definitions")
          .select("id,name")
          .eq("organisation_id", org)
          .in(
            "id",
            runs.map((r) => r.workflow_id),
          )
      : {data: []};
    for (const run of runs ?? []) {
      const name = workflows?.find((w) => w.id === run.workflow_id)?.name;
      if (name) workflowNames.set(run.id, name);
    }
  }

  const attention = [...(notifications ?? [])]
      .sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          b.last_detected_at.localeCompare(a.last_detected_at),
      )
      .slice(0, 5),
    topInsights = [...(insights ?? [])]
      .sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          b.updated_at.localeCompare(a.updated_at),
      )
      .slice(0, 4),
    attentionTotal = (notificationCount ?? 0) + (approvals?.length ?? 0);

  const pulseEvents: IntelligenceEvent[] = (pulseRows ?? []).map((e) => ({
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
    })),
    pulse = weeklyPulse({
      events: pulseEvents,
      activity: {current: activityNow ?? 0, previous: activityBefore ?? 0},
      now,
      currencyHint: ctx.organisation.default_currency ?? "GBP",
    });

  const firstName =
      (ctx.user.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ?? null,
    headline = `${greeting(ctx.organisation.timezone, now)}${firstName ? `, ${firstName}` : ""}`,
    summaryParts = [
      broken.length
        ? `${plural(broken.length, "connection")} need${broken.length === 1 ? "s" : ""} fixing`
        : null,
      attentionTotal
        ? `${plural(attentionTotal, "thing")} need${attentionTotal === 1 ? "s" : ""} your attention`
        : null,
    ].filter(Boolean),
    summary = summaryParts.length
      ? `${summaryParts.join(" and ")}.`
      : connections.length
        ? "Everything is running smoothly."
        : "Let's get your tools connected.";

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-700">
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: ctx.organisation.timezone ?? "UTC",
            })}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            {headline}
          </h1>
          <p className="mt-2 text-base text-zinc-500">{summary}</p>
        </div>
        <form action={runIntelligenceAction}>
          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:text-zinc-950">
            <RefreshCw aria-hidden className="h-4 w-4" />
            Refresh insights
          </button>
        </form>
      </header>

      <Notice searchParams={params} />
      <AutoRefresh active={connections.some((c) => c.state === "syncing")} />

      {!connections.length ? (
        <GettingStarted />
      ) : broken.length ? (
        <section
          aria-labelledby="fix-heading"
          className="overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-rose-50/60 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/50 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <Plug aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 id="fix-heading" className="font-semibold text-zinc-950">
                  Fix these first
                </h2>
                <p className="text-sm text-zinc-600">
                  {plural(broken.length, "connection")} stopped sending data, so your numbers and
                  insights are out of date.
                </p>
              </div>
            </div>
            {healthyCount ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CircleCheck aria-hidden className="h-3.5 w-3.5" />
                {healthyCount} working fine
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-amber-100/80">
            {broken.slice(0, VISIBLE_CONNECTIONS).map((c) => (
              <BrokenConnection key={c.id} connection={c} />
            ))}
          </ul>
          {broken.length > VISIBLE_CONNECTIONS ? (
            <details className="group/rest border-t border-amber-100/80">
              <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 px-6 py-3 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 group-open/rest:border-b group-open/rest:border-amber-100/80 [&::-webkit-details-marker]:hidden">
                <span className="group-open/rest:hidden">
                  Show {broken.length - VISIBLE_CONNECTIONS} more
                </span>
                <span className="hidden group-open/rest:inline">Show fewer</span>
                <ChevronDown
                  aria-hidden
                  className="h-4 w-4 transition-transform group-open/rest:rotate-180"
                />
              </summary>
              <ul className="divide-y divide-amber-100/80">
                {broken.slice(VISIBLE_CONNECTIONS).map((c) => (
                  <BrokenConnection key={c.id} connection={c} />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-5 py-3.5 text-sm text-emerald-800">
          <CircleCheck aria-hidden className="h-5 w-5 shrink-0" />
          All {plural(connections.length, "connection")} are up to date.
          <Link href="/app/integrations" className="ml-auto font-medium hover:underline">
            Manage
          </Link>
        </section>
      )}

      {connections.length ? (
        <section aria-label="This week">
          <SectionHeading
            title="This week"
            description="The last 7 days compared with the 7 before."
          />
          <div
            className={`grid gap-4 sm:grid-cols-2 ${pulse.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
          >
            {pulse.map((metric) => (
              <article
                key={metric.key}
                className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-600">{metric.label}</p>
                  <p className="truncate text-xs text-zinc-400">{metric.source}</p>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
                  {metric.value}
                </p>
                <div className="mt-3">
                  <TrendChip change={metric.change} higherIsBetter={metric.higherIsBetter} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {connections.length ? (
        <div className="grid gap-10 lg:grid-cols-5">
          <section className="lg:col-span-3" aria-label="Needs your attention">
            <SectionHeading
              title="Needs your attention"
              description="Approvals waiting on you and the most important alerts."
              href="/app/action-centre"
              linkLabel={attentionTotal > 5 ? `All ${attentionTotal}` : "Action Centre"}
            />
            {approvals?.length || attention.length ? (
              <ul className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03]">
                {(approvals ?? []).map((a) => (
                  <li key={a.id} className="border-b border-zinc-100 last:border-0">
                    <Link
                      href={`/app/approvals/${a.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
                        <Stamp aria-hidden className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-900">
                          Approve: {workflowNames.get(a.run_id) ?? "an automation"}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {a.due_at
                            ? `Due ${new Date(a.due_at).toLocaleString("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})}`
                            : `Waiting since ${timeAgo(a.created_at, now)}`}
                        </p>
                      </div>
                      <ArrowRight aria-hidden className="h-4 w-4 text-zinc-300" />
                    </Link>
                  </li>
                ))}
                {attention.map((n) => (
                  <li key={n.id} className="border-b border-zinc-100 last:border-0">
                    <Link
                      href={`/app/action-centre/${n.id}`}
                      className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-zinc-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <SeverityLabel severity={n.severity} />
                          <span className="text-xs text-zinc-400">
                            {timeAgo(n.last_detected_at, now)}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-medium text-zinc-900">{n.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">{n.summary}</p>
                      </div>
                      <ArrowRight aria-hidden className="mt-6 h-4 w-4 shrink-0 text-zinc-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CircleCheck aria-hidden className="h-5 w-5" />
                </span>
                <p className="mt-3 font-medium text-zinc-900">You&apos;re all caught up</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Nothing needs you right now. New alerts and approvals will appear here.
                </p>
              </div>
            )}
          </section>

          <section className="lg:col-span-2" aria-label="Insights">
            <SectionHeading
              title="Insights"
              description="What Ghost noticed in your business."
              href="/app/insights"
              linkLabel={insightCount && insightCount > 4 ? `All ${insightCount}` : "All insights"}
            />
            {topInsights.length ? (
              <div className="space-y-3">
                {topInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                  <Sparkles aria-hidden className="h-5 w-5" />
                </span>
                <p className="mt-3 font-medium text-zinc-900">No insights right now</p>
                <p className="mt-1 max-w-xs text-sm text-zinc-500">
                  When Ghost spots a change in your sales, payments, ads or website, it will explain
                  it here.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
