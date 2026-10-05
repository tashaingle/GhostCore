"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import type {Json} from "@/types/database";

export async function saveGooglePlayApps(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    selected = new Set(form.getAll("app").map(String).slice(0, 20)),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "google_play")
      .maybeSingle();
  if (!item) redirect("/app/integrations?error=Google%20Play%20connection%20not%20found.");
  const settings = item.settings as Record<string, Json>,
    apps = Array.isArray(settings.apps)
      ? settings.apps.map((value) => {
          const app = value as Record<string, Json>;
          return {...app, selected: selected.has(String(app.packageName))};
        })
      : [];
  await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        apps,
        configurationStatus: apps.some((app) => app.selected) ? "ready" : "property_required",
      },
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  await ctx.supabase.from("integration_logs").insert({
    organisation_id: ctx.organisation.id,
    integration_id: integrationId,
    provider: "google_play",
    status: "finished",
    records_received: apps.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {operation: "app_selection", selectedApps: selected.size},
  });
  redirect("/app/integrations?success=Google%20Play%20apps%20saved.");
}
