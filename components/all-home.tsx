import {switchOrganisation} from "@/app/organisation-actions";
import {Notice} from "@/components/notice";
import {TodoList} from "@/components/todo-list";
import {Sparkline} from "@/components/charts/sparkline";
import {TrendChip} from "@/components/home-ui";
import {PeriodPills, arrangeFigures} from "@/components/how-youre-doing";
import {ProjectRail, type ProjectTone} from "@/components/project-rail";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {loadPerformance} from "@/lib/home/load-performance";
import {organisationPeople} from "@/lib/organisations/people";
import {projectHref, sortProjects} from "@/lib/home/projects";
import {assigneeIds, todoChoice} from "@/lib/home/todo";
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
    Promise.all(
      projects.map(async (project) => {
        try {
          return await loadPerformance(ctx.supabase, project.id, period, now);
        } catch {
          return {metrics: [] as Metric[], highlights: [], updates: 0};
        }
      }),
    ),
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
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const cards = projects.map((project, index) => {
    const performance = performances[index];
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
  const people = await Promise.all(
    projects.map((project) => organisationPeople(ctx.supabase, project.id, ctx.user.id)),
  );
  const peopleByOrg = new Map(projects.map((project, index) => [project.id, people[index]]));
  const shared = tasks ?? [];
  const taskIds = shared.map((task) => task.id);
  const {data: assignments} = taskIds.length
    ? await ctx.supabase
        .from("work_assignments")
        .select("task_id, assigned_user_id")
        .in("organisation_id", ids)
        .in("task_id", taskIds)
        .is("unassigned_at", null)
    : {data: []};
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
    {label: "Projects", value: counts.projects, note: "On this board"},
    {label: "On track", value: counts.onTrack, note: labels.current},
    {label: "Needs a look", value: counts.attention, note: labels.current},
    {label: "Open to-dos", value: counts.todos, note: "Everyone"},
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            {`${greeting(ctx.organisation.timezone, now)}${firstName ? `, ${firstName}` : ""}`}
          </h1>
        </div>
        <PeriodPills period={period} scope="all" list={list} />
      </header>
      <Notice searchParams={searchParams} />
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ProjectRail
          projects={cards.map((card) => ({
            id: card.project.id,
            name: card.project.name,
            tone: card.tone,
          }))}
          activeId={ctx.organisation.id}
          scope="all"
          period={period}
        />
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {widgets.map((widget) => (
              <article
                key={widget.label}
                className="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/80"
              >
                <p className="text-xs font-medium text-zinc-500">{widget.label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">
                  {widget.value}
                </p>
                <p className="mt-1 text-xs capitalize text-zinc-400">{widget.note}</p>
              </article>
            ))}
          </div>

          {compared.length ? (
            <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-zinc-200/80">
              <h2 className="text-sm font-semibold text-zinc-950">Change since {labels.previous}</h2>
              <ul className="mt-4 space-y-3">
                {compared.map((row) => (
                  <li key={row.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-zinc-900">{row.name}</span>
                      <span className="text-zinc-500">
                        {row.label} {row.value}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
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

          <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-950">Projects</h2>
              <p className="text-xs text-zinc-500">
                {`${labels.current[0].toUpperCase()}${labels.current.slice(1)} against ${labels.previous}. Open a project for the full report.`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-zinc-50 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
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
                    <tr key={card.project.id} className="border-t border-zinc-100">
                      <td className="px-4 py-3">
                        <form action={switchOrganisation}>
                          <input type="hidden" name="organisationId" value={card.project.id} />
                          <input type="hidden" name="next" value={projectHref("one", period)} />
                          <button className="font-medium text-zinc-950 hover:underline">
                            {card.project.name}
                          </button>
                        </form>
                        {card.line ? (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-zinc-500">{card.line}</p>
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
                          <TrendChip change={card.lead.change} higherIsBetter={card.lead.higherIsBetter} />
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

          <TodoList
            scope="all"
            period={period}
            currentUserId={ctx.user.id}
            teams={projects.map((project) => ({
              id: project.id,
              name: project.name,
              people: (peopleByOrg.get(project.id)?.list ?? []).map((person) => ({
                userId: person.userId,
                label: person.label,
              })),
            }))}
            items={shared.map((task) => {
              const chosen = assigneeIds(task.id, task.assigned_user_id, assignments ?? []);
              const lookup = peopleByOrg.get(task.organisation_id);
              return {
                id: task.id,
                title: task.title,
                status: task.status,
                organisationId: task.organisation_id,
                organisationName: names.get(task.organisation_id),
                assigneeIds: chosen,
                assigneeLabel: chosen.map((id) => lookup?.name(id) ?? "Team member").join(", ") || "No one yet",
              };
            })}
          />
        </div>
      </div>
    </div>
  );
}
