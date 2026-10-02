import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {
  exchangeUserCode,
  GITHUB_APP_COOKIE,
  githubAppEnv,
  installation,
  stateMatches,
  userCanAccessInstallation,
} from "@/lib/integrations/github/app";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string) =>
  NextResponse.redirect(
    new URL(`/app/integrations?${kind}=${encodeURIComponent(message)}`, url.origin),
  );

/**
 * GitHub returns here after the app is installed (or its repository selection changed). The
 * installation is verified against the signed-in GitHub user before it is attached to the
 * organisation that started the flow.
 */
export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    raw = store.get(GITHUB_APP_COOKIE)?.value,
    installationId = url.searchParams.get("installation_id") ?? "",
    code = url.searchParams.get("code"),
    setupAction = url.searchParams.get("setup_action");
  store.delete(GITHUB_APP_COOKIE);

  // Changing the repository selection later from GitHub's settings also returns here. Ghost reads
  // the current selection on every sync, so there is nothing to store.
  if (!raw && setupAction === "update")
    return back(url, "success", "GitHub repository selection updated.");

  let state: {state: string; userId: string; organisationId: string; createdAt: number} | undefined;
  try {
    state = raw ? JSON.parse(raw) : undefined;
  } catch {}
  if (
    !state ||
    Date.now() - state.createdAt > 900_000 ||
    !stateMatches(state.state, url.searchParams.get("state")) ||
    !/^\d+$/.test(installationId) ||
    !code
  )
    return back(url, "error", "GitHub connection expired or failed validation. Please try again.");

  const env = githubAppEnv();
  if (!env) return back(url, "error", "GitHub App is not configured yet.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId)
      throw new Error("Your Ghost session changed. Please connect GitHub again.");
    const {data: member} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", state.organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !hasPermission(member.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect GitHub here.");

    const redirectUri = new URL("/api/integrations/github/callback", url.origin).toString(),
      userToken = await exchangeUserCode(env, code, redirectUri);
    if (!(await userCanAccessInstallation(userToken, installationId)))
      throw new Error("That GitHub installation doesn't belong to your GitHub account.");
    const details = await installation(env, installationId),
      login = details.account?.login ?? "GitHub";

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
        connectedAt: new Date().toISOString(),
      } as Json,
    };
    // One GitHub connection per organisation: an older OAuth connection is upgraded in place.
    const {data: existing} = await supabase
      .from("integrations")
      .select("id")
      .eq("organisation_id", state.organisationId)
      .eq("provider", "github")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    const result = existing
      ? await supabase
          .from("integrations")
          .update(values)
          .eq("id", existing.id)
          .eq("organisation_id", state.organisationId)
      : await supabase
          .from("integrations")
          .insert({organisation_id: state.organisationId, provider: "github", ...values});
    if (result.error) throw new Error("The GitHub connection could not be saved.");
    return back(
      url,
      "success",
      details.repository_selection === "all"
        ? `GitHub connected (${login}, all repositories).`
        : `GitHub connected (${login}, selected repositories).`,
    );
  } catch (error) {
    console.error("GitHub App connection failed", error);
    return back(
      url,
      "error",
      error instanceof Error && !/fetch|network/i.test(error.message)
        ? error.message
        : "GitHub connection failed. Please try again.",
    );
  }
}
