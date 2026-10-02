import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database, Json} from "@/types/database";
import {GitHubApi} from "./api";
import {type GitHubAppEnv, installation, installationToken} from "./app";
import {initialSelection} from "./selection";

export {selectedRepositories} from "./selection";

/** Most repositories one organisation can track, matching the per-sync limit. */
export const MAX_SELECTED_REPOSITORIES = 20;

export async function installationRepositories(env: GitHubAppEnv, installationId: string) {
  return new GitHubApi(await installationToken(env, installationId)).installationRepositories();
}

/** Connects (or switches) an organisation's GitHub to an installation the user has verified. */
export async function attachInstallation(
  supabase: SupabaseClient<Database>,
  env: GitHubAppEnv,
  organisationId: string,
  installationId: string,
) {
  const [details, available] = await Promise.all([
    installation(env, installationId),
    installationRepositories(env, installationId),
  ]);
  const login = details.account?.login ?? "GitHub";
  // One GitHub connection per organisation: an older connection is upgraded in place.
  const {data: existing} = await supabase
    .from("integrations")
    .select("id,settings")
    .eq("organisation_id", organisationId)
    .eq("provider", "github")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const repositories = initialSelection(
    available,
    existing?.settings as Record<string, unknown> | null,
    installationId,
  );
  const values = {
    provider_account_id: `installation:${installationId}`,
    provider_account_name: login,
    status: "connected",
    // No long-lived token is stored: each sync mints a one-hour installation token.
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    last_sync_status: "connected",
    last_sync_error: null,
    settings: {
      mode: "app",
      installationId,
      accountLogin: login,
      accountType: details.account?.type ?? null,
      repositorySelection: details.repository_selection,
      repositories,
      configurationStatus: repositories.length ? "ready" : "property_required",
      connectedAt: new Date().toISOString(),
    } as Json,
  };
  const result = existing
    ? await supabase
        .from("integrations")
        .update(values)
        .eq("id", existing.id)
        .eq("organisation_id", organisationId)
    : await supabase
        .from("integrations")
        .insert({organisation_id: organisationId, provider: "github", ...values});
  if (result.error) throw new Error("The GitHub connection could not be saved.");
  return {login, needsChoice: repositories.length === 0, repositories};
}
