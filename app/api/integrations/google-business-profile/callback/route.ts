import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {businessScopeGranted} from "@/lib/integrations/google-business-profile/config";
import {exchangeCode, stateMatches} from "@/lib/integrations/google-business-profile/oauth";
import {BusinessProfileClient} from "@/lib/integrations/google-business-profile/client";
import {encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    expected = store.get("ghost_gbp_state")?.value,
    verifier = store.get("ghost_gbp_verifier")?.value,
    organisationId = store.get("ghost_gbp_org")?.value;
  store.delete("ghost_gbp_state");
  store.delete("ghost_gbp_verifier");
  store.delete("ghost_gbp_org");
  if (url.searchParams.get("error"))
    return back(url, "error", "Google Business Profile authorization was denied.");
  const code = url.searchParams.get("code");
  if (
    !stateMatches(expected, url.searchParams.get("state")) ||
    !code ||
    !verifier ||
    !organisationId
  )
    return back(
      url,
      "error",
      "Google Business Profile authorization expired or failed validation.",
    );
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
      throw new Error("You no longer have permission to connect Google Business Profile here.");
    const tokens = await exchangeCode(code, verifier);
    if (!businessScopeGranted(tokens.scope))
      throw new Error(
        "Google did not grant Business Profile access. On the Google screen, tick the Business Profile permission and try again.",
      );
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {Authorization: `Bearer ${tokens.access_token}`},
        signal: AbortSignal.timeout(15_000),
      }),
      profile = profileResponse.ok
        ? ((await profileResponse.json()) as {sub?: string; email?: string})
        : {};
    if (!profile.sub) throw new Error("Google account identity could not be verified.");
    const client = new BusinessProfileClient({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      }),
      discovered = await client.locations(),
      {data: existing} = await supabase
        .from("integrations")
        .select("id,refresh_token_encrypted,settings")
        .eq("organisation_id", organisationId)
        .eq("provider", "google_business_profile")
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
      oldLocations = Array.isArray(old.locations)
        ? (old.locations as {location?: string; selected?: boolean}[])
        : [],
      previouslySelected = new Set(
        oldLocations
          .filter((place) => place.selected && place.location)
          .map((place) => String(place.location)),
      ),
      locations = discovered.map((place) => ({
        ...place,
        selected:
          previouslySelected.has(place.location) ||
          (oldLocations.length === 0 && discovered.length === 1),
      })),
      settings = {
        ...old,
        accountEmail: profile.email ?? null,
        configurationStatus: locations.some((place) => place.selected)
          ? "ready"
          : "property_required",
        locations,
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
          provider: "google_business_profile",
          ...values,
        });
    if (result.error)
      throw new Error(
        "Google Business Profile authorization succeeded, but the connection could not be saved.",
      );
    return back(
      url,
      "success",
      `Google Business Profile connected as ${profile.email ?? "Google account"}.`,
      "/app/integrations/google-business-profile/settings",
    );
  } catch (error) {
    return back(
      url,
      "error",
      error instanceof Error ? error.message : "Google Business Profile connection failed.",
    );
  }
}
