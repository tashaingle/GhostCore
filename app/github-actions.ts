"use server";
import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {GITHUB_CHOICES_COOKIE, githubAppEnv} from "@/lib/integrations/github/app";
import {readGitHubChoices} from "@/lib/integrations/github/choices";
import {
  attachInstallation,
  installationRepositories,
  MAX_SELECTED_REPOSITORIES,
} from "@/lib/integrations/github/repositories";
import type {Json} from "@/types/database";

const SETTINGS = "/app/integrations/github/settings";
const go = (path: string, kind: "error" | "success", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function chooseGitHubInstallation(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const env = githubAppEnv();
  if (!env) return go("/app/integrations", "error", "GitHub isn't set up on this site yet.");
  const choices = await readGitHubChoices(ctx.user.id, ctx.organisation.id),
    id = String(form.get("installationId") ?? "");
  if (!choices?.installations.some((i) => i.id === id))
    return go("/app/integrations", "error", "That took too long. Please connect GitHub again.");
  (await cookies()).delete({name: GITHUB_CHOICES_COOKIE, path: "/app/integrations/github"});
  let result: Awaited<ReturnType<typeof attachInstallation>>;
  try {
    result = await attachInstallation(ctx.supabase, env, ctx.organisation.id, id);
  } catch (error) {
    console.error("GitHub App connection failed", error);
    return go("/app/integrations", "error", "GitHub connection failed. Please try again.");
  }
  return result.needsChoice
    ? go(
        SETTINGS,
        "success",
        `GitHub connected (${result.login}). Now choose which repositories this organisation tracks.`,
      )
    : go("/app/integrations", "success", `GitHub connected (${result.login}).`);
}

export async function saveGitHubRepositories(form: FormData) {
  const ctx = await getActiveOrganisation();
  if (!ctx) redirect("/login");
  requireOrganisationAdmin(ctx.membership.role);
  const env = githubAppEnv();
  if (!env) return go("/app/integrations", "error", "GitHub isn't set up on this site yet.");
  const {data: item} = await ctx.supabase
    .from("integrations")
    .select("id,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "github")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const settings = (item?.settings ?? {}) as Record<string, Json>;
  if (!item || typeof settings.installationId !== "string")
    return go("/app/integrations", "error", "Connect GitHub first.");
  let available: string[];
  try {
    available = await installationRepositories(env, settings.installationId);
  } catch {
    return go(SETTINGS, "error", "Metric Mage couldn't reach GitHub. Please try again.");
  }
  // Only repositories the installation can actually see may be saved.
  const picked = new Set(form.getAll("repository").map(String)),
    repositories = available.filter((r) => picked.has(r));
  if (repositories.length > MAX_SELECTED_REPOSITORIES)
    return go(SETTINGS, "error", `Choose up to ${MAX_SELECTED_REPOSITORIES} repositories.`);
  const {error} = await ctx.supabase
    .from("integrations")
    .update({
      settings: {
        ...settings,
        repositories,
        configurationStatus: repositories.length ? "ready" : "property_required",
      },
    })
    .eq("id", item.id)
    .eq("organisation_id", ctx.organisation.id);
  if (error) return go(SETTINGS, "error", "Your choice couldn't be saved. Please try again.");
  return repositories.length
    ? go(
        "/app/integrations",
        "success",
        `GitHub will track ${repositories.length === 1 ? repositories[0] : `${repositories.length} repositories`}. Click Sync now to update.`,
      )
    : go(SETTINGS, "success", "Saved. GitHub won't sync until you choose at least one repository.");
}
