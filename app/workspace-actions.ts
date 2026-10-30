"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {getActiveOrganisation} from "@/lib/organisations/active";

const PATH = "/app/workspaces";
const message = (kind: "error" | "success", value: string) =>
  `${PATH}?${kind}=${encodeURIComponent(value)}`;

export async function renameWorkspace(form: FormData) {
  const name = z.string().trim().min(2).max(60).safeParse(form.get("name"));
  if (!name.success) redirect(message("error", "Workspace names must be 2 to 60 characters."));
  const ctx = await getActiveOrganisation();
  const {data, error} = await ctx.supabase
    .from("workspaces")
    .update({name: name.data, updated_at: new Date().toISOString()})
    .eq("id", ctx.workspace.id)
    .select("id");
  if (error || !data?.length)
    redirect(message("error", "Only owners and admins can rename this workspace."));
  revalidatePath("/app", "layout");
  redirect(message("success", "Workspace renamed."));
}

/** Moves the active business to another workspace. Its members and data stay as they are. */
export async function moveBusiness(form: FormData) {
  const target = z.uuid().safeParse(form.get("workspaceId"));
  if (!target.success) redirect(message("error", "Pick a workspace to move it to."));
  const ctx = await getActiveOrganisation();
  if (!hasPermission(ctx.membership.role as OrganisationRole, "organisation.edit"))
    redirect(message("error", `Only owners and admins can move ${ctx.organisation.name}.`));
  if (target.data === ctx.workspace.id) redirect(message("error", "It's already in that workspace."));
  if (!ctx.workspaces.some((workspace) => workspace.id === target.data))
    redirect(message("error", "Pick one of your workspaces."));
  const {error} = await ctx.supabase
    .from("organisations")
    .update({workspace_id: target.data, updated_at: new Date().toISOString()})
    .eq("id", ctx.organisation.id);
  if (error)
    redirect(message("error", "You need to be an owner or admin in that workspace to move it there."));
  revalidatePath("/app", "layout");
  const name = ctx.workspaces.find((workspace) => workspace.id === target.data)?.name;
  redirect(message("success", `${ctx.organisation.name} moved to ${name ?? "that workspace"}.`));
}
