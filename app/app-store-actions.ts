"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {
  AppStoreClient,
  AppStoreError,
  appStoreVendorNumber,
} from "@/lib/integrations/app-store/client";
import {
  AppStoreKeyError,
  parseAppStoreKey,
  storedAppStoreKey,
} from "@/lib/integrations/app-store/key";
import type {AppStoreKey} from "@/lib/integrations/app-store/types";
import {decryptToken, encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const CONNECT = "/app/integrations/app-store/connect";
const SETTINGS = "/app/integrations/app-store/settings";
const go = (path: string, kind: "error" | "success", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function connectAppStore(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  let key;
  try {
    key = parseAppStoreKey({
      issuerId: form.get("issuerId"),
      keyId: form.get("keyId"),
      privateKey: form.get("privateKey"),
    });
  } catch (error) {
    return go(
      CONNECT,
      "error",
      error instanceof AppStoreKeyError ? error.message : "That key isn't valid.",
    );
  }
  let discovered;
  try {
    // Listing apps proves Apple accepts the key before anything is saved.
    discovered = await new AppStoreClient(key).apps();
  } catch (error) {
    return go(
      CONNECT,
      "error",
      error instanceof AppStoreError
        ? error.message
        : "Metric Mage couldn't reach App Store Connect.",
    );
  }
  const {data: existing} = await ctx.supabase
      .from("integrations")
      .select("id,settings,refresh_token_encrypted")
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "app_store")
      .eq("provider_account_id", key.issuerId)
      .maybeSingle(),
    old =
      existing?.settings &&
      typeof existing.settings === "object" &&
      !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, unknown>)
        : {},
    oldApps = Array.isArray(old.apps) ? (old.apps as {appId?: string; selected?: boolean}[]) : [],
    previouslySelected = new Set(
      oldApps.filter((app) => app.selected && app.appId).map((app) => String(app.appId)),
    ),
    apps = discovered.map((app) => ({
      ...app,
      selected:
        previouslySelected.has(app.appId) || (oldApps.length === 0 && discovered.length === 1),
    })),
    values = {
      provider_account_id: key.issuerId,
      provider_account_name: `App Store Connect key ${key.keyId}`,
      status: "connected",
      access_token_encrypted: encryptToken(JSON.stringify(key)),
      // Keeps a separate downloads key added in settings.
      refresh_token_encrypted: existing?.refresh_token_encrypted ?? null,
      token_expires_at: null,
      settings: {
        ...old,
        issuerId: key.issuerId,
        keyId: key.keyId,
        configurationStatus: apps.some((app) => app.selected) ? "ready" : "property_required",
        apps,
      } as Json,
      last_sync_status: "connected",
      last_sync_error: null,
    },
    result = existing
      ? await ctx.supabase
          .from("integrations")
          .update(values)
          .eq("id", existing.id)
          .eq("organisation_id", ctx.organisation.id)
      : await ctx.supabase.from("integrations").insert({
          organisation_id: ctx.organisation.id,
          provider: "app_store",
          ...values,
        });
  if (result.error)
    return go(CONNECT, "error", "Apple accepted the key, but the connection could not be saved.");
  return go(SETTINGS, "success", "App Store connected.");
}

export async function saveAppStoreApps(form: FormData) {
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
      .eq("provider", "app_store")
      .maybeSingle();
  if (!item) return go("/app/integrations", "error", "App Store connection not found.");
  const settings = item.settings as Record<string, Json>,
    apps = Array.isArray(settings.apps)
      ? settings.apps.map((value) => {
          const app = value as Record<string, Json>;
          return {...app, selected: selected.has(String(app.appId))};
        })
      : [];
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        apps,
        configurationStatus: apps.some((app) => app.selected) ? "ready" : "property_required",
      },
      last_sync_error: null,
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  if (error) return go(SETTINGS, "error", "Your choice couldn't be saved. Please try again.");
  await ctx.supabase.from("integration_logs").insert({
    organisation_id: ctx.organisation.id,
    integration_id: integrationId,
    provider: "app_store",
    status: "finished",
    records_received: apps.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {operation: "app_selection", selectedApps: selected.size},
  });
  return go("/app/integrations", "success", "App Store apps saved.");
}

/**
 * Turns on daily downloads. Apple only shares sales reports with keys that have the Sales (with
 * access to reports), Finance or Admin role, so a second key can be added for them. Reading
 * yesterday's report checks both before anything is saved.
 */
export async function saveAppStoreDownloads(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    rawVendor = String(form.get("vendorNumber") || "").trim(),
    keyId = String(form.get("reportsKeyId") || "").trim(),
    pem = String(form.get("reportsPrivateKey") || "").trim(),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings,access_token_encrypted,refresh_token_encrypted")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "app_store")
      .maybeSingle();
  if (!item?.access_token_encrypted)
    return go("/app/integrations", "error", "App Store connection not found.");
  const settings = item.settings as Record<string, Json>;
  if (!rawVendor) {
    // An empty vendor number turns downloads off and forgets the extra key.
    const rest = {...settings};
    for (const key of ["vendorNumber", "reportsKeyId", "downloadsError", "downloadsSyncedAt"])
      delete rest[key];
    const {error} = await ctx.supabase
      .from("integrations")
      .update({settings: rest, refresh_token_encrypted: null})
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id);
    return error
      ? go(SETTINGS, "error", "Your change couldn't be saved. Please try again.")
      : go(SETTINGS, "success", "App Store downloads turned off.");
  }
  let vendorNumber: string, reportsKey: AppStoreKey | null;
  try {
    vendorNumber = appStoreVendorNumber(rawVendor);
    const main = storedAppStoreKey(decryptToken(item.access_token_encrypted));
    reportsKey =
      keyId || pem
        ? parseAppStoreKey({issuerId: main.issuerId, keyId, privateKey: pem})
        : item.refresh_token_encrypted
          ? storedAppStoreKey(decryptToken(item.refresh_token_encrypted))
          : null;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await new AppStoreClient(reportsKey ?? main).downloads(vendorNumber, yesterday);
  } catch (error) {
    return go(
      SETTINGS,
      "error",
      error instanceof AppStoreError || error instanceof AppStoreKeyError
        ? error.message
        : "Metric Mage couldn't read downloads from Apple.",
    );
  }
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        vendorNumber,
        reportsKeyId: reportsKey?.keyId ?? null,
        downloadsError: null,
      },
      refresh_token_encrypted: reportsKey ? encryptToken(JSON.stringify(reportsKey)) : null,
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  if (error) return go(SETTINGS, "error", "Your change couldn't be saved. Please try again.");
  return go(
    SETTINGS,
    "success",
    "Downloads are on. The last month of downloads will arrive at the next sync.",
  );
}
