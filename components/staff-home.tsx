import {switchOrganisation} from "@/app/organisation-actions";
import {addTodo, completeTodo} from "@/app/todo-actions";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";

const PROJECT_ORDER = ["xufu", "carprise", "prestige", "tzkia", "tazkia"];

function projectRank(name: string) {
  const key = name.toLowerCase();
  const index = PROJECT_ORDER.findIndex((item) => key.includes(item));
  return index === -1 ? PROJECT_ORDER.length : index;
}

export async function StaffHome({list}: {list: "mine" | "team"}) {
  const ctx = await getActiveOrganisation();
  const ids = ctx.organisations.map((item) => item.id);
  const [{data: connections}, {data: tasks}, people] = await Promise.all([
    ctx.supabase
      .from("integrations")
      .select("organisation_id")
      .in("organisation_id", ids)
      .neq("status", "disconnected"),
    ctx.supabase
      .from("work_tasks")
      .select("id,title,assigned_user_id,created_at")
      .eq("organisation_id", ctx.organisation.id)
      .in("status", ["backlog", "open", "in_progress", "blocked", "waiting"])
      .order("created_at", {ascending: false})
      .limit(30),
    organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
  ]);
  const connected = new Set((connections ?? []).map((row) => row.organisation_id));
  const projects = [...ctx.organisations].sort(
    (a, b) => projectRank(a.name) - projectRank(b.name) || a.name.localeCompare(b.name, "en-GB"),
  );
  const open = (tasks ?? []).filter((task) => list === "team" || task.assigned_user_id === ctx.user.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="card" aria-label="Projects">
        <h2 className="text-lg font-semibold text-zinc-950">Projects</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {projects.map((project) => {
            const current = project.id === ctx.organisation.id;
            const note = connected.has(project.id) ? null : "Not connected yet";
            return (
              <li key={project.id}>
                {current ? (
                  <p className="rounded-xl bg-zinc-950 px-3 py-2 text-sm text-white">
                    <span className="font-medium">{project.name}</span>
                    {note ? <span className="ml-2 text-white/70">{note}</span> : null}
                  </p>
                ) : (
                  <form action={switchOrganisation}>
                    <input type="hidden" name="organisationId" value={project.id} />
                    <button className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm text-zinc-800 hover:border-zinc-300">
                      <span className="font-medium">{project.name}</span>
                      {note ? <span className="ml-2 text-zinc-500">{note}</span> : null}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-label="To do">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">To do</h2>
          <p className="text-sm">
            <a className={list === "mine" ? "font-semibold text-zinc-950" : "text-zinc-500"} href="/app">
              Mine
            </a>
            <span className="px-2 text-zinc-300" aria-hidden>
              /
            </span>
            <a
              className={list === "team" ? "font-semibold text-zinc-950" : "text-zinc-500"}
              href="/app?list=team"
            >
              Whole team
            </a>
          </p>
        </div>
        <form action={addTodo} className="mt-3 flex gap-2">
          <input type="hidden" name="list" value={list} />
          <label className="sr-only" htmlFor="todo-title">
            Add a to do
          </label>
          <input
            id="todo-title"
            className="field"
            name="title"
            maxLength={200}
            placeholder="Add something to do"
            required
          />
          <button className="button shrink-0">Add</button>
        </form>
        {open.length ? (
          <ul className="mt-4 divide-y divide-zinc-100">
            {open.map((task) => (
              <li key={task.id} className="flex items-start gap-3 py-2.5">
                <form action={completeTodo}>
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="id" value={task.id} />
                  <button className="button-ghost mt-0.5 px-2 py-1 text-xs" type="submit">
                    Done
                  </button>
                </form>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900">{task.title}</p>
                  {list === "team" && task.assigned_user_id ? (
                    <p className="text-xs text-zinc-500">{people.name(task.assigned_user_id)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            {list === "mine" ? "Nothing on your list yet." : "Nothing on the team list yet."}
          </p>
        )}
      </section>
    </div>
  );
}
