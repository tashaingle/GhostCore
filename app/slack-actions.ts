"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import type {Json} from "@/types/database";
import {SlackClient} from "@/lib/integrations/slack/client";
import {mergeSlackChannels} from "@/lib/integrations/slack/channels";
import {slackEnv} from "@/lib/integrations/slack/config";
import {decryptToken} from "@/lib/security/token-crypto";

const SETTINGS = "/app/integrations/slack/settings";

/** Re-reads channels from Slack, e.g. after the app was invited to more channels. */
export async function refreshSlackChannels(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings,access_token_encrypted")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "slack")
      .maybeSingle();
  if (!item?.access_token_encrypted)
    redirect(`${SETTINGS}?error=${encodeURIComponent("Reconnect Slack, then try again.")}`);
  let fresh;
  try {
    fresh = await new SlackClient(decryptToken(item.access_token_encrypted)).channels(
      slackEnv().privateChannels,
    );
  } catch (error) {
    console.error("Slack channel refresh failed", error);
    redirect(
      `${SETTINGS}?error=${encodeURIComponent("Slack channels could not be refreshed. Try Reconnect.")}`,
    );
  }
  const settings = item.settings as Record<string, Json>,
    channels = mergeSlackChannels(fresh, settings.channels);
  await ctx.supabase
    .from("integrations")
    .update({settings: {...settings, channels} as unknown as Json})
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  const ready = channels.filter((c) => c.isMember).length;
  redirect(
    `${SETTINGS}?success=${encodeURIComponent(`Channels refreshed. Ghost can read ${ready} of ${channels.length}.`)}`,
  );
}
export async function saveSlackChannels(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    selected = new Set(form.getAll("channel").map(String).slice(0, 50)),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("settings")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "slack")
      .maybeSingle();
  if (!item) redirect("/app/integrations?error=Slack%20integration%20not%20found.");
  const settings = item.settings as Record<string, Json>,
    before = Array.isArray(settings.channels) ? (settings.channels as Record<string, Json>[]) : [],
    channels = before.map((c) => ({...c, selected: selected.has(String(c.id))}));
  await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        channels,
        configurationStatus: selected.size ? "ready" : "property_required",
      },
    })
    .eq("id", integrationId)
    .eq("organisation_id", ctx.organisation.id);
  await ctx.supabase.from("integration_logs").insert({
    organisation_id: ctx.organisation.id,
    integration_id: integrationId,
    provider: "slack",
    status: "finished",
    records_received: channels.length,
    events_imported: 0,
    events_skipped: 0,
    error_count: 0,
    metadata: {
      operation: "channel_selection",
      selectedCount: selected.size,
      previousSelectedCount: before.filter((c) => c.selected).length,
    },
  });
  redirect("/app/integrations?success=Slack%20channels%20saved.");
}
