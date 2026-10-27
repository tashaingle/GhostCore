"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {organisationPeople} from "@/lib/organisations/people";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {projectHref} from "@/lib/home/projects";
import type {Period} from "@/lib/home/performance";
import {createServiceClient} from "@/lib/supabase/service";
import {nextTaskStatuses} from "@/lib/work/status";
import {createTask, transitionWork} from "@/lib/work/service";
import type {TaskStatus} from "@/lib/work/types";

function returnPath(form: FormData) {
  const scope = form.get("scope") === "one" ? "one" : "all";
  const periodValue = form.get("period");
  const period: Period = periodValue === "month" || periodValue === "year" ? periodValue : "week";
  const listValue = form.get("list");
  const list = listValue === "team" || listValue === "mine" ? listValue : undefined;
  return projectHref(scope, period, list);
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

type Active = NonNullable<Awaited<ReturnType<typeof getActiveOrganisation>>>;

async function chosenPeople(
  form: FormData,
  supabase: Active["supabase"],
  organisationId: string,
  path: string,
) {
  const raw = [
    ...new Set(
      form
        .getAll("assignee")
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
  if (!raw.length) fail(path, "Choose who needs to do this.");
  const parsed = raw.map((value) => z.uuid().safeParse(value));
  if (parsed.some((item) => !item.success)) fail(path, "Choose people from this project.");
  const people = await organisationPeople(supabase, organisationId);
  const allowed = new Set(people.list.map((person) => person.userId));
  const ids = parsed.map((item) => (item.success ? item.data : ""));
  if (ids.some((id) => !allowed.has(id))) fail(path, "Choose people from this project.");
  return ids;
}

async function addAssignees(
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

function chosenOrganisation(form: FormData, ctx: Active) {
  const raw = form.get("organisationId");
  if (typeof raw !== "string" || !raw) return {id: ctx.organisation.id, role: ctx.membership.role};
  const parsed = z.uuid().safeParse(raw);
  const found = parsed.success ? ctx.organisations.find((item) => item.id === parsed.data) : null;
  return found ? {id: found.id, role: found.role} : null;
}

export async function addTodo(form: FormData) {
  const path = returnPath(form);
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  if (!title.success) fail(path, "Write a short to do first.");
  const ctx = await getActiveOrganisation();
  const organisation = chosenOrganisation(form, ctx);
  if (!organisation) fail(path, "Pick one of your projects.");
  if (!hasPermission(organisation.role as OrganisationRole, "work.create"))
    fail(path, "You can't add to this list.");
  const assignees = await chosenPeople(form, ctx.supabase, organisation.id, path);
  const service = createServiceClient();
  try {
    const created = await createTask(service, organisation.id, ctx.user.id, {
      title: title.data,
      status: "open",
      priority: "normal",
      sourceType: "manual",
      ownerUserId: ctx.user.id,
      assignedUserId: assignees[0],
    });
    await addAssignees(service, organisation.id, ctx.user.id, created.item.id, assignees.slice(1));
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That couldn't be added.");
  }
  revalidatePath("/app");
  redirect(`${path}${path.includes("?") ? "&" : "?"}success=${encodeURIComponent("Added to your list.")}`);
}

const targets = ["open", "in_progress", "completed"] as const;

function statusPath(from: TaskStatus, to: TaskStatus) {
  if (from === to) return [];
  const queue: TaskStatus[][] = [[from]];
  const seen = new Set<TaskStatus>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    const last = current[current.length - 1];
    for (const next of nextTaskStatuses(last) as TaskStatus[]) {
      if (seen.has(next)) continue;
      const step = [...current, next];
      if (next === to) return step.slice(1);
      seen.add(next);
      queue.push(step);
    }
  }
  return null;
}

export async function setTodoStatus(form: FormData) {
  const path = returnPath(form);
  const taskId = z.uuid().safeParse(form.get("id"));
  const target = z.enum(targets).safeParse(form.get("status"));
  if (!taskId.success || !target.success) fail(path, "That to do could not be updated.");
  const ctx = await getActiveOrganisation();
  const organisation = chosenOrganisation(form, ctx);
  if (!organisation) fail(path, "That to do could not be found.");
  if (!hasPermission(organisation.role as OrganisationRole, "work.complete"))
    fail(path, "You can't change that to do.");
  const service = createServiceClient();
  const {data: task} = await service
    .from("work_tasks")
    .select("status,source_type")
    .eq("id", taskId.data)
    .eq("organisation_id", organisation.id)
    .maybeSingle();
  if (!task || task.source_type !== "manual") fail(path, "That to do could not be found.");
  const steps = statusPath(task.status as TaskStatus, target.data);
  if (!steps) fail(path, "That status can't be set.");
  try {
    let current = task.status;
    for (const status of steps) {
      await transitionWork(
        service,
        organisation.id,
        ctx.user.id,
        "task",
        taskId.data,
        {
          status,
          summary: status === "completed" ? "Done" : undefined,
          reason: current === "completed" || current === "cancelled" ? "Status changed" : undefined,
        },
        ["owner", "admin"].includes(organisation.role),
      );
      current = status;
    }
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That couldn't be updated.");
  }
  revalidatePath("/app");
  redirect(path);
}

export async function setTodoPeople(form: FormData) {
  const path = returnPath(form);
  const taskId = z.uuid().safeParse(form.get("id"));
  if (!taskId.success) fail(path, "That to do could not be found.");
  const ctx = await getActiveOrganisation();
  const organisation = chosenOrganisation(form, ctx);
  if (!organisation) fail(path, "That to do could not be found.");
  if (!hasPermission(organisation.role as OrganisationRole, "work.complete"))
    fail(path, "You can't change who does that.");
  const assignees = await chosenPeople(form, ctx.supabase, organisation.id, path);
  const service = createServiceClient();
  const {data: task} = await service
    .from("work_tasks")
    .select("id,source_type")
    .eq("id", taskId.data)
    .eq("organisation_id", organisation.id)
    .maybeSingle();
  if (!task || task.source_type !== "manual") fail(path, "That to do could not be found.");
  const now = new Date().toISOString();
  const {error: taskError} = await service
    .from("work_tasks")
    .update({assigned_user_id: assignees[0], updated_at: now})
    .eq("id", taskId.data)
    .eq("organisation_id", organisation.id);
  if (taskError) fail(path, "Those people couldn't be saved.");
  const {error: clearError} = await service
    .from("work_assignments")
    .update({unassigned_at: now})
    .eq("organisation_id", organisation.id)
    .eq("task_id", taskId.data)
    .is("unassigned_at", null);
  if (clearError) fail(path, "Those people couldn't be saved.");
  try {
    await addAssignees(service, organisation.id, ctx.user.id, taskId.data, assignees);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Those people couldn't be saved.");
  }
  revalidatePath("/app");
  redirect(path);
}
