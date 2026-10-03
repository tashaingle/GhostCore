"use server";
import {redirect} from "next/navigation";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {VercelClient, VercelError} from "@/lib/integrations/vercel/client";
import {VERCEL_LIMITS} from "@/lib/integrations/vercel/config";
import {decryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const SETTINGS = "/app/integrations/vercel/settings";
const go = (path: string, kind: "error" | "success", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function saveVercelProjects(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const integrationId = String(form.get("integrationId") || ""),
    {data: item} = await ctx.supabase
      .from("integrations")
      .select("id,access_token_encrypted,settings")
      .eq("id", integrationId)
      .eq("organisation_id", ctx.organisation.id)
      .eq("provider", "vercel")
      .maybeSingle();
  if (!item?.access_token_encrypted)
    return go("/app/integrations", "error", "Connect Vercel first.");
  const settings = (item.settings ?? {}) as Record<string, Json>,
    teamId = typeof settings.teamId === "string" ? settings.teamId : null;
  let available: string[];
  try {
    available = (
      await new VercelClient(decryptToken(item.access_token_encrypted)).projects(teamId)
    ).map((project) => project.id);
  } catch (error) {
    return go(
      SETTINGS,
      "error",
      error instanceof VercelError
        ? error.message
        : "Metric Mage couldn't reach Vercel. Please try again.",
    );
  }
  const picked = new Set(form.getAll("project").map(String)),
    selectedProjectIds = available.filter((id) => picked.has(id));
  if (selectedProjectIds.length > VERCEL_LIMITS.maxSelectedProjects)
    return go(SETTINGS, "error", `Choose up to ${VERCEL_LIMITS.maxSelectedProjects} projects.`);
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        selectedProjectIds,
        configurationStatus: selectedProjectIds.length ? "ready" : "property_required",
      },
    })
    .eq("id", item.id)
    .eq("organisation_id", ctx.organisation.id);
  if (error) return go(SETTINGS, "error", "Your choice couldn't be saved. Please try again.");
  return selectedProjectIds.length
    ? go(
        "/app/integrations",
        "success",
        `Vercel will watch ${selectedProjectIds.length === 1 ? "1 project" : `${selectedProjectIds.length} projects`}. Click Sync now to update.`,
      )
    : go(SETTINGS, "success", "Saved. Vercel won't sync until you choose at least one project.");
}
