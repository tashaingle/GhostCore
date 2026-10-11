"use server";
import {redirect, unstable_rethrow} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {GOAL_METRICS, isGoalMetric} from "@/lib/goals/progress";

const back = (message: string, error = false) => {
  revalidatePath("/app", "layout");
  redirect(`/app/goals?${error ? "error" : "success"}=${encodeURIComponent(message)}`);
};
async function context() {
  const ctx = await getActiveOrganisation();
  if (!hasPermission(ctx.membership.role as OrganisationRole, "goals.manage"))
    throw new Error("Only owners, admins and managers can set goals.");
  return ctx;
}

export async function saveGoalAction(form: FormData) {
  try {
    const ctx = await context(),
      metric = String(form.get("metric") ?? ""),
      target = Number(String(form.get("target") ?? "").replace(/[£$€,\s]/g, "")),
      currency = String(form.get("currency") ?? "GBP")
        .trim()
        .toUpperCase();
    if (!isGoalMetric(metric)) throw new Error("Choose what the goal is for.");
    if (!Number.isFinite(target) || target <= 0 || target > 1_000_000_000)
      throw new Error("Enter a target above zero.");
    if (GOAL_METRICS[metric].unit === "money" && !/^[A-Z]{3}$/.test(currency))
      throw new Error("Choose a currency.");
    const {error} = await ctx.supabase.from("goals").upsert(
      {
        organisation_id: ctx.organisation.id,
        metric,
        target: GOAL_METRICS[metric].unit === "money" ? target : Math.round(target),
        currency: GOAL_METRICS[metric].unit === "money" ? currency : null,
        created_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      },
      {onConflict: "organisation_id,metric"},
    );
    if (error) throw new Error("The goal couldn't be saved. Please try again.");
    back(`${GOAL_METRICS[metric].label} goal saved. You'll see progress on Home.`);
  } catch (e) {
    unstable_rethrow(e);
    back(e instanceof Error ? e.message : "The goal couldn't be saved.", true);
  }
}

export async function removeGoalAction(form: FormData) {
  try {
    const ctx = await context(),
      metric = String(form.get("metric") ?? "");
    if (!isGoalMetric(metric)) throw new Error("That goal wasn't found.");
    const {error} = await ctx.supabase
      .from("goals")
      .delete()
      .eq("organisation_id", ctx.organisation.id)
      .eq("metric", metric);
    if (error) throw new Error("The goal couldn't be removed. Please try again.");
    back(`${GOAL_METRICS[metric].label} goal removed.`);
  } catch (e) {
    unstable_rethrow(e);
    back(e instanceof Error ? e.message : "The goal couldn't be removed.", true);
  }
}
