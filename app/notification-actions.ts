"use server";

import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {mutateNotification} from "@/lib/notifications/actions";
import {createServiceClient} from "@/lib/supabase/service";
import {generateNotificationsForOrganisation} from "@/lib/notifications/generate";

const uuid = z.string().uuid();
const actionSchema = z.enum([
  "acknowledge",
  "snooze",
  "unsnooze",
  "resolve",
  "dismiss",
  "reopen",
  "assign",
  "unassign",
]);

/** Next.js redirect() throws; rethrow so callers don't treat it as a failure. */
function isNextControlFlow(error: unknown): error is {digest: string} {
  return (
    error !== null &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as {digest?: unknown}).digest === "string"
  );
}

function back(path: string, message: string, error = false): never {
  revalidatePath("/app/action-centre");
  revalidatePath("/app/command-centre");
  redirect(`${path}?${error ? "error" : "success"}=${encodeURIComponent(message)}`);
}

export async function notificationAction(form: FormData) {
  const ctx = await getActiveOrganisation();
  const action = actionSchema.safeParse(String(form.get("action") ?? ""));
  const rawIds = [
    ...form.getAll("ids").map(String),
    ...String(form.get("id") ?? "").split(","),
  ].filter(Boolean);
  const ids = z.array(uuid).max(100).safeParse(rawIds);
  const returnTo = String(form.get("returnTo") ?? "/app/action-centre");
  if (!action.success || !ids.success) {
    return back(returnTo, "Invalid notification action.", true);
  }
  try {
    for (const id of ids.data) {
      await mutateNotification({
        client: ctx.supabase,
        organisationId: ctx.organisation.id,
        userId: ctx.user.id,
        role: ctx.membership.role as OrganisationRole,
        notificationId: id,
        action: action.data,
        reason: String(form.get("reason") ?? "").trim(),
        assignedUserId: String(form.get("assignedUserId") ?? "") || undefined,
        snoozedUntil: String(form.get("snoozedUntil") ?? "") || undefined,
      });
    }
    return back(
      returnTo,
      `${ids.data.length} notification${ids.data.length === 1 ? "" : "s"} updated.`,
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      returnTo,
      error instanceof Error ? error.message : "Notification action failed.",
      true,
    );
  }
}

export async function evaluateNotificationsAction() {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "notifications.rules.manage")) {
    return back(
      "/app/action-centre",
      "Only owners and admins can evaluate notification rules.",
      true,
    );
  }
  try {
    const metrics = await generateNotificationsForOrganisation({
      client: createServiceClient(),
      organisationId: ctx.organisation.id,
      triggerType: "manual",
    });
    return back(
      "/app/action-centre",
      `Evaluated ${metrics.rulesEvaluated} rules: ${metrics.created} created, ${metrics.updated} updated, ${metrics.reopened} reopened, ${metrics.resolved} resolved, ${metrics.skipped} skipped, ${metrics.errors} errors.`,
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      "/app/action-centre",
      error instanceof Error ? error.message : "Evaluation failed.",
      true,
    );
  }
}

export async function saveNotificationPreference(form: FormData) {
  const ctx = await getActiveOrganisation();
  const scope = String(form.get("scope") ?? "user");
  const role = ctx.membership.role as OrganisationRole;
  const page = "/app/action-centre/preferences";
  if (scope === "organisation" && !hasPermission(role, "notifications.rules.manage")) {
    return back(page, "Only owners and admins can change the team's default.", true);
  }
  const severity = z
    .enum(["info", "warning", "critical"])
    .safeParse(String(form.get("minimumSeverity") ?? "warning"));
  if (!severity.success) return back(page, "Please choose which alerts to email.", true);
  const userId = scope === "user" ? ctx.user.id : null;
  // Settings apply to every kind of alert; null columns need .is(), not .eq().
  let lookup = ctx.supabase
    .from("notification_preferences")
    .select("id")
    .eq("organisation_id", ctx.organisation.id)
    .is("category", null);
  lookup = userId ? lookup.eq("user_id", userId) : lookup.is("user_id", null);
  const {data: existing} = await lookup.maybeSingle();
  const preference = {
    minimum_severity: severity.data,
    // Alerts always show in the Action Centre; email is sent as each alert arrives.
    in_app_enabled: true,
    email_enabled: form.get("email") === "on",
    webhook_enabled: false,
    assignment_enabled: form.get("assignment") === "on",
    digest_mode: "immediate",
  };
  const result = existing
    ? await ctx.supabase
        .from("notification_preferences")
        .update({...preference, updated_at: new Date().toISOString()})
        .eq("id", existing.id)
    : await ctx.supabase.from("notification_preferences").insert({
        organisation_id: ctx.organisation.id,
        user_id: userId,
        category: null,
        ...preference,
      });
  return back(
    page,
    result.error
      ? "Your email settings couldn't be saved. Please try again."
      : scope === "user"
        ? "Your email settings are saved."
        : "The team's default email settings are saved.",
    Boolean(result.error),
  );
}
