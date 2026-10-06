import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {adsScopeGranted} from "@/lib/integrations/google-ads/config";
import {exchangeCode, stateMatches} from "@/lib/integrations/google-ads/oauth";
import {GoogleAdsClient} from "@/lib/integrations/google-ads/client";
import {encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    expected = store.get("ghost_gads_state")?.value,
    verifier = store.get("ghost_gads_verifier")?.value,
    organisationId = store.get("ghost_gads_org")?.value;
  store.delete("ghost_gads_state");
  store.delete("ghost_gads_verifier");
  store.delete("ghost_gads_org");
  if (url.searchParams.get("error"))
    return back(url, "error", "Google Ads authorization was denied.");
  const code = url.searchParams.get("code");
  if (
    !stateMatches(expected, url.searchParams.get("state")) ||
    !code ||
    !verifier ||
    !organisationId
  )
    return back(url, "error", "Google Ads authorization expired or failed validation.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user) throw new Error("Your Metric Mage session expired.");
    const {data: member} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !hasPermission(member.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect Google Ads here.");
    const tokens = await exchangeCode(code, verifier);
    if (!adsScopeGranted(tokens.scope))
      throw new Error(
        "Google did not grant Google Ads access. On the Google screen, allow Google Ads access and try again.",
      );
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {Authorization: `Bearer ${tokens.access_token}`},
        signal: AbortSignal.timeout(15_000),
      }),
      profile = profileResponse.ok
        ? ((await profileResponse.json()) as {sub?: string; email?: string})
        : {};
    if (!profile.sub) throw new Error("Google account identity could not be verified.");
    const client = new GoogleAdsClient({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      }),
      discovered = await client.accounts(),
      {data: existing} = await supabase
        .from("integrations")
        .select("id,refresh_token_encrypted,settings")
        .eq("organisation_id", organisationId)
        .eq("provider", "google_ads")
        .eq("provider_account_id", profile.sub)
        .maybeSingle();
    if (!tokens.refresh_token && !existing?.refresh_token_encrypted)
      throw new Error(
        "Google returned no refresh token. Remove Metric Mage access from Google and reconnect.",
      );
    const old =
        existing?.settings &&
        typeof existing.settings === "object" &&
        !Array.isArray(existing.settings)
          ? (existing.settings as Record<string, unknown>)
          : {},
      oldAccounts = Array.isArray(old.accounts)
        ? (old.accounts as {customerId?: string; selected?: boolean}[])
        : [],
      previouslySelected = new Set(
        oldAccounts
          .filter((account) => account.selected && account.customerId)
          .map((account) => String(account.customerId)),
      ),
      accounts = discovered.map((account) => ({
        ...account,
        selected:
          previouslySelected.has(account.customerId) ||
          (oldAccounts.length === 0 && discovered.length === 1),
      })),
      settings = {
        ...old,
        accountEmail: profile.email ?? null,
        configurationStatus: accounts.some((account) => account.selected)
          ? "ready"
          : "property_required",
        accounts,
        scopes: (tokens.scope ?? "").split(/[\s,]+/).filter(Boolean),
      } as Json,
      values = {
        provider_account_id: profile.sub,
        provider_account_name: profile.email ?? "Google account",
        status: "connected",
        access_token_encrypted: encryptToken(tokens.access_token!),
        refresh_token_encrypted: tokens.refresh_token
          ? encryptToken(tokens.refresh_token)
          : (existing?.refresh_token_encrypted ?? null),
        token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        settings,
        last_sync_status: "connected",
        last_sync_error: null,
      };
    const result = existing
      ? await supabase
          .from("integrations")
          .update(values)
          .eq("id", existing.id)
          .eq("organisation_id", organisationId)
      : await supabase.from("integrations").insert({
          organisation_id: organisationId,
          provider: "google_ads",
          ...values,
        });
    if (result.error)
      throw new Error("Google Ads authorization succeeded, but the connection could not be saved.");
    return back(
      url,
      "success",
      `Google Ads connected as ${profile.email ?? "Google account"}.`,
      "/app/integrations/google-ads/settings",
    );
  } catch (error) {
    return back(
      url,
      "error",
      error instanceof Error ? error.message : "Google Ads connection failed.",
    );
  }
}
