import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/types/database";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {organisationPeople} from "@/lib/organisations/people";
import {createServiceClient} from "@/lib/supabase/service";
import {createTask} from "@/lib/work/service";
import {dueAtFromDay} from "./todo";

/** Rules for adding to the shared to-do list, used by the app form and the Claude connector. */
export const todoTitle = z.string().trim().min(1).max(200);

/** An optional deadline day: undefined when it's invalid, null when it's blank. */
export function todoDueAt(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const day = z.iso.date().safeParse(raw.trim());
  return day.success ? dueAtFromDay(day.data) : undefined;
}

/** The people chosen for a to-do, or the message to show when they can't be used. */
export async function todoAssignees(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  values: unknown[],
): Promise<{ids: string[]} | {error: string}> {
  const raw = [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
  if (!raw.length) return {error: "Choose who needs to do this."};
  const parsed = raw.map((value) => z.uuid().safeParse(value));
  if (parsed.some((item) => !item.success)) return {error: "Choose people from this project."};
  const people = await organisationPeople(supabase, organisationId);
  const allowed = new Set(people.list.map((person) => person.userId));
  const ids = parsed.map((item) => (item.success ? item.data : ""));
  if (ids.some((id) => !allowed.has(id))) return {error: "Choose people from this project."};
  return {ids};
}

export async function addAssignees(
  service: ReturnType<typeof createServiceClient>,
  organisationId: string,
  actorId: string,
  taskId: string,
  userIds: string[],
) {
  if (!userIds.length) return;
  const {error} = await service.from("work_assignments").insert(
    userIds.map((userId) => ({
      organisation_id: organisationId,
      work_type: "task" as const,
      task_id: taskId,
      assigned_user_id: userId,
      assigned_by: actorId,
      reason: "Added to this to do.",
    })),
  );
  if (error) throw new Error("Those people couldn't be added.");
}

export const canAddTodo = (role: string) => hasPermission(role as OrganisationRole, "work.create");

/** Creates a manual to-do once the title, deadline, permission and people have been checked. */
export async function createManualTodo(input: {
  organisationId: string;
  userId: string;
  title: string;
  dueAt: string | null;
  assigneeIds: string[];
}) {
  const service = createServiceClient();
  const created = await createTask(service, input.organisationId, input.userId, {
    title: input.title,
    status: "open",
    priority: "normal",
    sourceType: "manual",
    ownerUserId: input.userId,
    assignedUserId: input.assigneeIds[0],
    dueAt: input.dueAt,
  });
  await addAssignees(
    service,
    input.organisationId,
    input.userId,
    created.item.id,
    input.assigneeIds.slice(1),
  );
  return created.item;
}
