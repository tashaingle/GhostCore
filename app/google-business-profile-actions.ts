"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import type {Json} from "@/types/database";

const SETTINGS = "/app/integrations/google-business-profile/settings";
const go = (path: string, kind: "error" | "success", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function saveBusinessProfileLocations(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    selected = new Set(form.getAll("location").map(String).slice(0, 20)),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "google_business_profile")
      .maybeSingle();
  if (!item) return go("/app/integrations", "error", "Business Profile connection not found.");
  const settings = item.settings as Record<string, Json>,
    locations = Array.isArray(settings.locations)
      ? settings.locations.map((value) => {
          const place = value as Record<string, Json>;
          return {...place, selected: selected.has(String(place.location))};
        })
      : [];
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        locations,
        configurationStatus: locations.some((place) => place.selected)
          ? "ready"
          : "property_required",
      },
      last_sync_error: null,
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  if (error) return go(SETTINGS, "error", "Your choice couldn't be saved. Please try again.");
  await ctx.supabase.from("integration_logs").insert({
    organisation_id: ctx.organisation.id,
    integration_id: integrationId,
    provider: "google_business_profile",
    status: "finished",
    records_received: locations.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {operation: "location_selection", selectedLocations: selected.size},
  });
  return go("/app/integrations", "success", "Business Profile locations saved.");
}
