"use server";
import {redirect} from "next/navigation";
import {after} from "next/server";
import {createServiceClient} from "@/lib/supabase/service";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {runIntegrationSync} from "@/lib/integrations/sync-runner";
import {getProvider} from "@/lib/integrations/registry";
import {loadConnector} from "@/lib/integrations/loader";
import {decryptToken} from "@/lib/security/token-crypto";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {requirePermission} from "@/lib/auth/permissions";
const destination = (kind: "error" | "success", message: string) =>
  `/app/integrations?${kind}=${encodeURIComponent(message)}`;
/**
 * Starts a sync and returns immediately; the sync itself runs after the response is sent, so a
 * slow provider never blocks navigation. The page shows "Syncing" and refreshes until it finishes.
 * Insights are refreshed by the hourly background job rather than on every manual sync.
 */
export async function syncIntegration(form: FormData) {
  const integrationId = String(form.get("integrationId") || "");
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/app/onboarding");
  requirePermission(ctx.membership.role, "integration.sync");
  const {data: integration} = await ctx.supabase
    .from("integrations")
    .select("id,provider")
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id)
    .maybeSingle();
  if (!integration) redirect(destination("error", "That connection no longer exists."));
  const name = getProvider(integration.provider)?.displayName ?? integration.provider;
  await ctx.supabase
    .from("integrations")
    .update({status: "syncing", last_sync_status: "syncing", last_sync_error: null})
    .eq("id", integration.id)
    .eq("organisation_id", ctx.organisation.id);
  const organisationId = ctx.organisation.id,
    userId = ctx.user.id;
  after(async () => {
    const service = createServiceClient();
    try {
      // The runner records success or failure on the integration once it holds the sync lock.
      await runIntegrationSync({
        supabase: service,
        userId,
        organisationId,
        integrationId: integration.id,
      });
    } catch (error) {
      console.error("Background sync failed", integration.provider, error);
      const message = error instanceof Error ? error.message : "Sync failed.";
      // Another sync already holds the lock and will record its own result.
      if (/already syncing/i.test(message)) return;
      // Failures before the runner took over would otherwise leave the card stuck on "Syncing".
      await service
        .from("integrations")
        .update({
          status: "error",
          last_sync_status: "error",
          last_sync_error: message.slice(0, 300),
        })
        .eq("id", integration.id)
        .eq("organisation_id", organisationId)
        .eq("status", "syncing");
    }
  });
  revalidatePath("/app");
  revalidatePath("/app/integrations");
  redirect(destination("success", `${name} sync started. This page updates when it finishes.`));
}
export async function disconnectIntegration(form: FormData) {
  const integrationId = String(form.get("integrationId") || "");
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/app/onboarding");
  requireOrganisationAdmin(ctx.membership.role);
  const {data: integration} = await ctx.supabase
    .from("integrations")
    .select("id,provider,access_token_encrypted,refresh_token_encrypted,token_expires_at,settings")
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id)
    .maybeSingle();
  if (!integration) redirect(destination("error", "That connection no longer exists."));
  try {
    const credential = integration.access_token_encrypted
      ? decryptToken(integration.access_token_encrypted)
      : undefined;
    const connector = loadConnector(integration.provider, {
      accessToken: credential,
      refreshToken: integration.refresh_token_encrypted
        ? decryptToken(integration.refresh_token_encrypted)
        : undefined,
      expiresAt: integration.token_expires_at ?? undefined,
      settings: integration.settings as Record<string, unknown>,
    });
    const result = await connector.disconnect({
      organisationId: ctx.organisation.id,
      integrationId: integration.id,
    });
    if (!result.ok)
      throw new Error(result.message ?? "This tool couldn't be disconnected. Please try again.");
    const {error} = await ctx.supabase
      .from("integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        last_sync_status: "disconnected",
        last_sync_error: null,
      })
      .eq("id", integration.id)
      .eq("organisation_id", ctx.organisation.id);
    if (error) throw new Error("Integration credentials could not be removed.");
    revalidatePath("/app/integrations");
    redirect(
      destination(
        "success",
        `${getProvider(integration.provider)?.displayName ?? integration.provider} disconnected.`,
      ),
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(
      destination(
        "error",
        error instanceof Error
          ? error.message
          : "This tool couldn't be disconnected. Please try again.",
      ),
    );
  }
}
