"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {createServiceClient} from "@/lib/supabase/service";
import {createTask, transitionWork} from "@/lib/work/service";
import {nextTaskStatuses} from "@/lib/work/status";
import type {TaskStatus} from "@/lib/work/types";

const improvementSchema = z.object({
  organisationId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
  area: z.enum(["app", "website"]),
  priority: z.enum(["low", "normal", "high", "critical"]),
});

/** Back to the Improvements page, keeping the business that was picked at the top. */
function backTo(form: FormData) {
  const back = form.get("returnTo");
  return typeof back === "string" && /^\/app\/improvements(\?project=[0-9a-f-]{36})?$/.test(back)
    ? back
    : "/app/improvements";
}

function withMessage(path: string, kind: "error" | "success", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`;
}

function fail(path: string, message: string): never {
  redirect(withMessage(path, "error", message));
}

function projectFor(id: string, organisations: {id: string; role: string}[]) {
  return organisations.find((project) => project.id === id) ?? null;
}

export async function addImprovement(form: FormData) {
  const path = backTo(form);
  const parsed = improvementSchema.safeParse({
    organisationId: form.get("organisationId"),
    title: form.get("title"),
    description: form.get("description"),
    area: form.get("area"),
    priority: form.get("priority"),
  });
  if (!parsed.success) fail(path, "Check the improvement details and try again.");
  const ctx = await getActiveOrganisation();
  const project = projectFor(parsed.data.organisationId, ctx.organisations);
  if (!project || !hasPermission(project.role as OrganisationRole, "work.create"))
    fail(path, "You cannot add improvements to that project.");
  try {
    await createTask(createServiceClient(), project.id, ctx.user.id, {
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: "open",
      priority: parsed.data.priority,
      sourceType: "improvement",
      ownerUserId: ctx.user.id,
      assignedUserId: ctx.user.id,
      metadata: {area: parsed.data.area},
    });
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That improvement could not be added.");
  }
  revalidatePath("/app/improvements");
  redirect(withMessage(path, "success", "Improvement added."));
}

function pathTo(from: TaskStatus, to: TaskStatus) {
  if (from === to) return [];
  const queue: TaskStatus[][] = [[from]];
  const seen = new Set<TaskStatus>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    for (const next of nextTaskStatuses(path.at(-1)!) as TaskStatus[]) {
      if (seen.has(next)) continue;
      const candidate = [...path, next];
      if (next === to) return candidate.slice(1);
      seen.add(next);
      queue.push(candidate);
    }
  }
  return null;
}

async function improvementContext(form: FormData) {
  const path = backTo(form);
  const id = z.uuid().safeParse(form.get("id"));
  const organisationId = z.uuid().safeParse(form.get("organisationId"));
  if (!id.success || !organisationId.success) fail(path, "That improvement could not be found.");
  const ctx = await getActiveOrganisation();
  const project = projectFor(organisationId.data, ctx.organisations);
  if (!project) fail(path, "That improvement could not be found.");
  return {ctx, project, id: id.data, service: createServiceClient(), path};
}

export async function setImprovementStatus(form: FormData) {
  const target = z.enum(["open", "in_progress", "completed"]).safeParse(form.get("status"));
  if (!target.success) fail(backTo(form), "Choose a valid status.");
  const {ctx, project, id, service, path} = await improvementContext(form);
  if (!hasPermission(project.role as OrganisationRole, "work.complete")) fail(path, "You cannot change this item.");
  const {data: item} = await service.from("work_tasks").select("status,source_type").eq("id", id).eq("organisation_id", project.id).maybeSingle();
  if (!item || item.source_type !== "improvement") fail(path, "That improvement could not be found.");
  const steps = pathTo(item.status as TaskStatus, target.data as TaskStatus);
  if (!steps) fail(path, "That status cannot be set.");
  try {
    let current = item.status;
    for (const status of steps) {
      await transitionWork(service, project.id, ctx.user.id, "task", id, {status, summary: status === "completed" ? "Improvement completed" : undefined, reason: "Improvement status updated"}, ["owner", "admin", "manager"].includes(project.role));
      current = status;
    }
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That status could not be updated.");
  }
  revalidatePath("/app/improvements");
  redirect(path);
}

export async function deleteImprovement(form: FormData) {
  const {ctx, project, id, service, path} = await improvementContext(form);
  const {data: item} = await service.from("work_tasks").select("source_type,created_by").eq("id", id).eq("organisation_id", project.id).maybeSingle();
  if (!item || item.source_type !== "improvement") fail(path, "That improvement could not be found.");
  const canManage = hasPermission(project.role as OrganisationRole, "work.manage");
  if (!canManage && item.created_by !== ctx.user.id) fail(path, "You can only delete improvements you created.");
  const {error} = await service.from("work_tasks").delete().eq("id", id).eq("organisation_id", project.id);
  if (error) fail(path, "That improvement could not be deleted.");
  revalidatePath("/app/improvements");
  redirect(withMessage(path, "success", "Improvement deleted."));
}
