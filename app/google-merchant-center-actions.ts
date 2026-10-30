"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import type {Json} from "@/types/database";

const SETTINGS = "/app/integrations/google-merchant-center/settings";
const go = (path: string, kind: "error" | "success", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function saveMerchantCenterAccounts(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    selected = new Set(form.getAll("account").map(String).slice(0, 5)),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "google_merchant_center")
      .maybeSingle();
  if (!item) return go("/app/integrations", "error", "Merchant Center connection not found.");
  const settings = item.settings as Record<string, Json>,
    accounts = Array.isArray(settings.accounts)
      ? settings.accounts.map((value) => {
          const account = value as Record<string, Json>;
          return {...account, selected: selected.has(String(account.accountId))};
        })
      : [];
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        accounts,
        configurationStatus: accounts.some((account) => account.selected)
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
    provider: "google_merchant_center",
    status: "finished",
    records_received: accounts.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {operation: "account_selection", selectedAccounts: selected.size},
  });
  return go("/app/integrations", "success", "Merchant Center accounts saved.");
}
