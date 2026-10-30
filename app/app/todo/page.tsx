import {TodoList} from "@/components/todo-list";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationsPeople} from "@/lib/organisations/people";
import {sortProjects} from "@/lib/home/projects";
import {assigneeIds} from "@/lib/home/todo";
import {CircleCheckBig, CircleDot, ListTodo} from "lucide-react";

export const metadata = {title: "To do"};

const SHOWN = ["backlog", "open", "in_progress", "blocked", "waiting", "completed"] as const;

export default async function TodoPage() {
  const ctx = await getActiveOrganisation();
  const projects = sortProjects(ctx.organisations);
  const ids = projects.map((project) => project.id);
  const {data: tasks} = ids.length
    ? await ctx.supabase
        .from("work_tasks")
        .select("id,title,status,assigned_user_id,organisation_id,created_at,due_at")
        .in("organisation_id", ids)
        .eq("source_type", "manual")
        .in("status", [...SHOWN])
        .order("created_at", {ascending: false})
        .limit(100)
    : {data: []};
  const peopleByOrg = await organisationsPeople(ctx.supabase, ids, ctx.user.id);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const taskIds = (tasks ?? []).map((task) => task.id);
  const {data: assignments} = taskIds.length
    ? await ctx.supabase
        .from("work_assignments")
        .select("task_id, assigned_user_id")
        .in("organisation_id", ids)
        .in("task_id", taskIds)
        .is("unassigned_at", null)
    : {data: []};

  const taskRows = tasks ?? [];
  const summary = {
    open: taskRows.filter((task) => ["backlog", "open", "waiting", "blocked"].includes(task.status)).length,
    doing: taskRows.filter((task) => task.status === "in_progress").length,
    done: taskRows.filter((task) => task.status === "completed").length,
  };
  return (
    <div className="mm-page mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Your focus</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">To do</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Keep every project moving from one shared, straightforward list.
        </p>
      </header>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          {label:"To do",value:summary.open,icon:ListTodo,tone:"bg-blue-50 text-blue-600"},
          {label:"In progress",value:summary.doing,icon:CircleDot,tone:"bg-amber-50 text-amber-600"},
          {label:"Completed",value:summary.done,icon:CircleCheckBig,tone:"bg-emerald-50 text-emerald-600"},
        ].map((item) => <article key={item.label} className="mm-panel flex items-center gap-4 rounded-2xl p-4"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${item.tone}`}><item.icon aria-hidden className="h-[18px] w-[18px]" /></span><div><p className="text-2xl font-semibold tabular-nums text-zinc-950">{item.value}</p><p className="text-xs text-zinc-500">{item.label}</p></div></article>)}
      </div>
      <TodoList
        scope="all"
        period="week"
        currentUserId={ctx.user.id}
        teams={projects.map((project) => ({
          id: project.id,
          name: project.name,
          people: (peopleByOrg.get(project.id)?.list ?? []).map((person) => ({
            userId: person.userId,
            label: person.label,
          })),
        }))}
        items={taskRows.map((task) => {
          const chosen = assigneeIds(task.id, task.assigned_user_id, assignments ?? []);
          const lookup = peopleByOrg.get(task.organisation_id);
          return {
            id: task.id,
            title: task.title,
            status: task.status,
            organisationId: task.organisation_id,
            organisationName: names.get(task.organisation_id),
            dueAt: task.due_at,
            assigneeIds: chosen,
            assigneeLabel:
              chosen.map((id) => lookup?.name(id) ?? "Team member").join(", ") || "No one yet",
          };
        })}
      />
    </div>
  );
}
