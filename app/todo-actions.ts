"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {createServiceClient} from "@/lib/supabase/service";
import {createTask, transitionWork} from "@/lib/work/service";

const listPath = (list: FormDataEntryValue | null) =>
  list === "team" ? "/app?list=team" : "/app";

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function addTodo(form: FormData) {
  const path = listPath(form.get("list"));
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  if (!title.success) fail(path, "Write a short to do first.");
  const ctx = await getActiveOrganisation();
  if (!hasPermission(ctx.membership.role as OrganisationRole, "work.create"))
    fail(path, "You can't add to this list.");
  try {
    await createTask(createServiceClient(), ctx.organisation.id, ctx.user.id, {
      title: title.data,
      status: "open",
      priority: "normal",
      sourceType: "manual",
      ownerUserId: ctx.user.id,
      assignedUserId: ctx.user.id,
    });
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That couldn't be added.");
  }
  revalidatePath("/app");
  redirect(`${path}${path.includes("?") ? "&" : "?"}success=${encodeURIComponent("Added to your list.")}`);
}

export async function completeTodo(form: FormData) {
  const path = listPath(form.get("list"));
  const taskId = z.uuid().safeParse(form.get("id"));
  if (!taskId.success) fail(path, "That to do could not be found.");
  const ctx = await getActiveOrganisation();
  if (!hasPermission(ctx.membership.role as OrganisationRole, "work.complete"))
    fail(path, "You can't mark that as done.");
  try {
    await transitionWork(
      createServiceClient(),
      ctx.organisation.id,
      ctx.user.id,
      "task",
      taskId.data,
      {status: "completed", summary: "Done"},
      ["owner", "admin"].includes(ctx.membership.role),
    );
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "That couldn't be marked done.");
  }
  revalidatePath("/app");
  redirect(path);
}
