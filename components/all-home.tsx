import {switchOrganisation} from "@/app/organisation-actions";
import {Notice} from "@/components/notice";
import {Sparkline} from "@/components/charts/sparkline";
import {TrendChip} from "@/components/home-ui";
import {PeriodPills, arrangeFigures} from "@/components/how-youre-doing";
import type {ProjectTone} from "@/components/project-rail";
import {BriefcaseBusiness, CircleCheckBig, ListChecks, TriangleAlert} from "lucide-react";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {loadPerformanceMany} from "@/lib/home/load-performance";
import {projectHref, sortProjects} from "@/lib/home/projects";
import {todoChoice} from "@/lib/home/todo";
import {PERIOD_LABEL, type Metric, type Period} from "@/lib/home/performance";

const SHOWN = ["backlog", "open", "in_progress", "blocked", "waiting", "completed"] as const;

const STATUS: Record<ProjectTone, {label: string; colour: string}> = {
  good: {label: "On track", colour: "#00c875"},
  bad: {label: "Needs a look", colour: "#e2445c"},
  steady: {label: "Steady", colour: "#fdab3d"},
  quiet: {label: "No figures yet", colour: "#579bfc"},
  empty: {label: "Not connected", colour: "#c4c4c4"},
};

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

function leadOf(metrics: Metric[]) {
  const arranged = arrangeFigures(metrics);
  return arranged.chart ?? arranged.top[0] ?? null;
}

function goingWell(change: number | null, higherIsBetter: boolean | null) {
  if (change === null || Math.abs(change) < 1 || higherIsBetter === null) return null;
  return change > 0 === higherIsBetter;
}

function toneFor(lead: Metric | null, connected: boolean): ProjectTone {
  if (!lead) return connected ? "quiet" : "empty";
  const well = goingWell(lead.change, lead.higherIsBetter);
  if (well === true) return "good";
  if (well === false) return "bad";
  return "steady";
}

function StatusLabel({tone}: {tone: ProjectTone}) {
  const status = STATUS[tone];
  return (
    <span
      className="inline-flex min-w-28 justify-center rounded px-2.5 py-1 text-xs font-semibold text-white"
      style={{background: status.colour}}
    >
      {status.label}
    </span>
  );
}

export async function AllHome({
  period,
  list,
  searchParams,
}: {
  period: Period;
  list: "mine" | "team";
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await getActiveOrganisation();
  const now = new Date();
  const projects = sortProjects(ctx.organisations);
  const ids = projects.map((project) => project.id);
  const emptyConnections = Promise.resolve({data: [] as {organisation_id: string}[]});
  const emptyTasks = Promise.resolve({
    data: [] as {
      id: string;
      title: string;
      status: string;
      assigned_user_id: string | null;
      organisation_id: string;
      created_at: string;
    }[],
  });
  const [{data: connections}, performances, {data: tasks}] = await Promise.all([
    ids.length
      ? ctx.supabase
          .from("integrations")
          .select("organisation_id")
          .in("organisation_id", ids)
          .neq("status", "disconnected")
      : emptyConnections,
    loadPerformanceMany(ctx.supabase, ids, period, now),
    ids.length
      ? ctx.supabase
          .from("work_tasks")
          .select("id,title,status,assigned_user_id,organisation_id,created_at")
          .in("organisation_id", ids)
          .eq("source_type", "manual")
          .in("status", [...SHOWN])
          .order("created_at", {ascending: false})
          .limit(40)
      : emptyTasks,
  ]);
  const connected = new Set((connections ?? []).map((row) => row.organisation_id));
  const cards = projects.map((project, index) => {
    const performance = performances.get(project.id);
    const lead = leadOf(performance?.metrics ?? []);
    const line = performance?.highlights[0]?.text ?? null;
    const isConnected = connected.has(project.id);
    return {
      project,
      lead,
      line,
      connected: isConnected,
      tone: toneFor(lead, isConnected),
    };
  });
  const compared = cards.flatMap((card) =>
    card.lead?.comparable && card.lead.change !== null
      ? [
          {
            id: card.project.id,
            name: card.project.name,
            label: card.lead.label,
            value: card.lead.value,
            change: card.lead.change,
            good: goingWell(card.lead.change, card.lead.higherIsBetter),
          },
        ]
      : [],
  );
  const scale = Math.max(20, ...compared.map((row) => Math.abs(row.change)), 0);
  const shared = tasks ?? [];
  const firstName =
    (ctx.user.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0] ?? null;
  const labels = PERIOD_LABEL[period];
  const counts = {
    projects: cards.length,
    onTrack: cards.filter((card) => card.tone === "good").length,
    attention: cards.filter((card) => card.tone === "bad").length,
    todos: shared.filter((task) => todoChoice(task.status) !== "completed").length,
  };
  const widgets = [
    {
      label: "Projects",
      value: counts.projects,
      note: "Active portfolio",
      icon: BriefcaseBusiness,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "On track",
      value: counts.onTrack,
      note: labels.current,
      icon: CircleCheckBig,
      iconClass: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Needs attention",
      value: counts.attention,
      note: labels.current,
      icon: TriangleAlert,
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "Open to-dos",
      value: counts.todos,
      note: "Across the team",
      icon: ListChecks,
      iconClass: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="mm-page mx-auto max-w-[1600px]">
      <header className="relative mb-5 overflow-hidden rounded-[28px] bg-ink px-6 py-7 text-white shadow-xl shadow-slate-950/10 md:px-8">
        <div aria-hidden className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-500/30 blur-3xl" />
        <div aria-hidden className="absolute bottom-0 right-1/3 h-24 w-56 rounded-full bg-teal-400/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
            Your workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {`${greeting(ctx.organisation.timezone, now)}${firstName ? `, ${firstName}` : ""}`}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/60">
            Here&apos;s the calm, clear version of what&apos;s happening across your projects.
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-1 ring-1 ring-white/10 backdrop-blur">
          <PeriodPills period={period} scope="all" list={list} />
        </div>
        </div>
      </header>
      <Notice searchParams={searchParams} />
      <div className="mt-4">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {widgets.map((widget) => (
              <article
                key={widget.label}
                className="mm-panel group rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">{widget.label}</p>
                    <p className="mt-2 text-[32px] font-semibold tabular-nums tracking-tight text-zinc-950">
                      {widget.value}
                    </p>
                  </div>
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${widget.iconClass}`}
                  >
                    <widget.icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                </div>
                <p className="mt-2 text-xs capitalize text-zinc-400">{widget.note}</p>
              </article>
            ))}
          </div>

          {compared.length ? (
            <section className="mm-panel rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">Portfolio performance</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Movement across your projects compared with {labels.previous}.
                  </p>
                </div>
                <span className="rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                  {labels.current}
                </span>
              </div>
              <ul className="mt-6 grid gap-x-8 gap-y-5 md:grid-cols-2">
                {compared.map((row) => (
                  <li key={row.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-zinc-900">{row.name}</span>
                      <span className="text-zinc-500">
                        {row.label} {row.value}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(4, (Math.abs(row.change) / scale) * 100)}%`,
                          background: row.good === false ? "#e2445c" : "#00c875",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mm-panel overflow-hidden rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">Project health</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {`${labels.current[0].toUpperCase()}${labels.current.slice(1)} against ${labels.previous}. Open a project for the full report.`}
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                {cards.length} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-zinc-50/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Project</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Figure</th>
                    <th className="px-3 py-2 font-semibold">Change</th>
                    <th className="px-3 py-2 font-semibold">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr
                      key={card.project.id}
                      className="border-t border-zinc-100 transition-colors hover:bg-zinc-50/70"
                    >
                      <td className="px-4 py-3.5">
                        <form action={switchOrganisation}>
                          <input type="hidden" name="organisationId" value={card.project.id} />
                          <input type="hidden" name="next" value={projectHref("all", period)} />
                          <button className="font-medium text-zinc-950 hover:underline">
                            {card.project.name}
                          </button>
                        </form>
                        {card.line ? (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">
                            {card.line}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <StatusLabel tone={card.tone} />
                      </td>
                      <td className="px-3 py-3 text-zinc-700">
                        {card.lead ? (
                          <>
                            <span className="text-zinc-400">{card.lead.label}</span>{" "}
                            <span className="font-medium text-zinc-950">{card.lead.value}</span>
                          </>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {card.lead ? (
                          <TrendChip
                            change={card.lead.change}
                            higherIsBetter={card.lead.higherIsBetter}
                          />
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {card.lead?.trend ? (
                          <Sparkline
                            trend={card.lead.trend}
                            label={`${card.project.name} ${card.lead.label}`}
                            className="h-8 w-[120px]"
                          />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
