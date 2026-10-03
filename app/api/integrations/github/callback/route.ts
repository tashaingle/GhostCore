import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {
  exchangeUserCode,
  GITHUB_APP_COOKIE,
  GITHUB_CHOICES_COOKIE,
  githubAppEnv,
  installUrl,
  stateMatches,
  userInstallations,
} from "@/lib/integrations/github/app";
import {attachInstallation} from "@/lib/integrations/github/repositories";
import {encryptToken} from "@/lib/security/token-crypto";

const SETTINGS = "/app/integrations/github/settings";
const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url.origin));
const cookieOptions = (path: string) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path,
  maxAge: 900,
});

/**
 * GitHub returns here after the user signs in with GitHub, installs the app, or changes the app's
 * repository selection. Installations are verified against the signed-in GitHub user before one is
 * attached to the organisation that started the flow.
 */
export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    raw = store.get(GITHUB_APP_COOKIE)?.value,
    installationId = url.searchParams.get("installation_id") ?? "",
    code = url.searchParams.get("code"),
    setupAction = url.searchParams.get("setup_action");
  store.delete(GITHUB_APP_COOKIE);

  // Changing the repository selection on GitHub also returns here (when "Redirect on update" is
  // on). Metric Mage reads the current list whenever it is needed, so send the user to choose.
  if (setupAction === "update" && (!raw || !code))
    return back(
      url,
      "success",
      "GitHub updated. Choose which repositories to track here.",
      SETTINGS,
    );

  let state: {state: string; userId: string; organisationId: string; createdAt: number} | undefined;
  try {
    state = raw ? JSON.parse(raw) : undefined;
  } catch {}
  if (
    !state ||
    Date.now() - state.createdAt > 900_000 ||
    !stateMatches(state.state, url.searchParams.get("state")) ||
    (installationId && !/^\d+$/.test(installationId)) ||
    !code
  )
    return back(url, "error", "GitHub connection expired or failed validation. Please try again.");

  const env = githubAppEnv();
  if (!env) return back(url, "error", "GitHub isn't set up on this site yet.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId)
      throw new Error("Your Metric Mage session changed. Please connect GitHub again.");
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
      installations = await userInstallations(await exchangeUserCode(env, code, redirectUri));
    let chosen = installationId;
    if (chosen && !installations.some((i) => i.id === chosen))
      throw new Error("That GitHub installation doesn't belong to your GitHub account.");
    if (!chosen) {
      if (!installations.length) {
        // Not installed anywhere yet: install it, then GitHub returns here with the installation.
        store.set(
          GITHUB_APP_COOKIE,
          JSON.stringify({...state, createdAt: Date.now()}),
          cookieOptions("/api/integrations/github"),
        );
        return NextResponse.redirect(installUrl(env.slug, state.state));
      }
      if (installations.length > 1) {
        // Installed on more than one GitHub account (e.g. personal and a company): let them pick.
        // Encrypted so the verified list can't be edited in the browser.
        store.set(
          GITHUB_CHOICES_COOKIE,
          encryptToken(
            JSON.stringify({
              userId: user.id,
              organisationId: state.organisationId,
              installations,
              createdAt: Date.now(),
            }),
          ),
          cookieOptions("/app/integrations/github"),
        );
        return NextResponse.redirect(new URL("/app/integrations/github/choose", url.origin));
      }
      chosen = installations[0].id;
    }
    const result = await attachInstallation(supabase, env, state.organisationId, chosen);
    return result.needsChoice
      ? back(
          url,
          "success",
          `GitHub connected (${result.login}). Now choose which repositories this organisation tracks.`,
          SETTINGS,
        )
      : back(url, "success", `GitHub connected (${result.login}).`);
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
