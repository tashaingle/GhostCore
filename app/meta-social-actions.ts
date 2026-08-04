"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import type {Json} from "@/types/database";

export async function saveMetaSocialAssets(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || "");
  const selected = new Set(form.getAll("asset").map(String).slice(0, 20));
  const {data: item} = await ctx.supabase
    .from("integrations")
    .select("settings")
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "meta_social")
    .maybeSingle();
  if (!item) redirect("/app/integrations?error=Meta%20Social%20integration%20not%20found.");
  const settings = item.settings as Record<string, Json>;
  const assets = Array.isArray(settings.assets)
    ? settings.assets.map((value) => {
        const a = value as Record<string, Json>;
        return {...a, selected: selected.has(String(a.id))};
      })
    : [];
  await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        assets,
        configurationStatus: selected.size ? "ready" : "property_required",
      },
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  await ctx.supabase.from("integration_logs").insert({
    organisation_id: ctx.organisation.id,
    integration_id: integrationId,
    provider: "meta_social",
    status: "finished",
    records_received: assets.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {operation: "asset_selection", selectedCount: selected.size},
  });
  redirect("/app/integrations?success=Meta%20Social%20assets%20saved.");
}
