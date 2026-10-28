import {TodoList} from "@/components/todo-list";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationsPeople} from "@/lib/organisations/people";
import {sortProjects} from "@/lib/home/projects";
import {assigneeIds} from "@/lib/home/todo";

export const metadata = {title: "To do"};

const SHOWN = ["backlog", "open", "in_progress", "blocked", "waiting", "completed"] as const;

export default async function TodoPage() {
  const ctx = await getActiveOrganisation();
  const projects = sortProjects(ctx.organisations);
  const ids = projects.map((project) => project.id);
  const {data: tasks} = ids.length
    ? await ctx.supabase
        .from("work_tasks")
        .select("id,title,status,assigned_user_id,organisation_id,created_at")
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

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Plan</p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">To do</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Keep every project moving from one shared, straightforward list.
        </p>
      </header>
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
        items={(tasks ?? []).map((task) => {
          const chosen = assigneeIds(task.id, task.assigned_user_id, assignments ?? []);
          const lookup = peopleByOrg.get(task.organisation_id);
          return {
            id: task.id,
            title: task.title,
            status: task.status,
            organisationId: task.organisation_id,
            organisationName: names.get(task.organisation_id),
            assigneeIds: chosen,
            assigneeLabel:
              chosen.map((id) => lookup?.name(id) ?? "Team member").join(", ") || "No one yet",
          };
        })}
      />
    </div>
  );
}
