import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {TodoList} from "@/components/todo-list";
import {assigneeIds} from "@/lib/home/todo";
import type {Period} from "@/lib/home/performance";

const SHOWN = ["backlog", "open", "in_progress", "blocked", "waiting", "completed"] as const;

export async function StaffHome({period}: {period: Period}) {
  const ctx = await getActiveOrganisation();
  const [{data: tasks}, people] = await Promise.all([
    ctx.supabase
      .from("work_tasks")
      .select("id,title,status,assigned_user_id,organisation_id,created_at")
      .eq("organisation_id", ctx.organisation.id)
      .eq("source_type", "manual")
      .in("status", [...SHOWN])
      .order("created_at", {ascending: false})
      .limit(40),
    organisationPeople(ctx.supabase, ctx.organisation.id, ctx.user.id),
  ]);
  const taskIds = (tasks ?? []).map((task) => task.id);
  const {data: assignments} = taskIds.length
    ? await ctx.supabase
        .from("work_assignments")
        .select("task_id, assigned_user_id")
        .eq("organisation_id", ctx.organisation.id)
        .in("task_id", taskIds)
        .is("unassigned_at", null)
    : {data: []};

  return (
    <TodoList
      scope="one"
      period={period}
      currentUserId={ctx.user.id}
      teams={[
        {
          id: ctx.organisation.id,
          name: ctx.organisation.name,
          people: people.list.map((person) => ({userId: person.userId, label: person.label})),
        },
      ]}
      items={(tasks ?? []).map((task) => {
        const ids = assigneeIds(task.id, task.assigned_user_id, assignments ?? []);
        return {
          id: task.id,
          title: task.title,
          status: task.status,
          organisationId: task.organisation_id,
          assigneeIds: ids,
          assigneeLabel: ids.map((id) => people.name(id)).join(", ") || "No one yet",
        };
      })}
    />
  );
}
