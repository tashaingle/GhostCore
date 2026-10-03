import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {TikTokClient} from "@/lib/integrations/tiktok/client";
import {exchangeTikTokCode, tiktokStateMatches} from "@/lib/integrations/tiktok/oauth";
import {encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    raw = store.get("ghost_tiktok_oauth")?.value;
  store.delete("ghost_tiktok_oauth");
  if (url.searchParams.get("error")) return back(url, "error", "TikTok authorization was denied.");
  let state:
    | {state: string; userId: string; organisationId: string; provider: string; createdAt: number}
    | undefined;
  try {
    state = raw ? JSON.parse(raw) : undefined;
  } catch {
    state = undefined;
  }
  const code = url.searchParams.get("code");
  if (
    !state ||
    state.provider !== "tiktok" ||
    Date.now() - state.createdAt > 600000 ||
    !tiktokStateMatches(state.state, url.searchParams.get("state")) ||
    !code
  )
    return back(url, "error", "TikTok authorization expired or failed validation.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId)
      throw new Error("Your Metric Mage session changed. Restart TikTok authorization.");
    const {data: member} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", state.organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !hasPermission(member.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect TikTok here.");
    const token = await exchangeTikTokCode(code),
      scopes = token.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
      client = new TikTokClient({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      }),
      profile = await client.profile(scopes.length ? scopes : ["user.info.basic"]),
      accountName = profile.displayName || profile.username || "TikTok",
      {data: existing} = await supabase
        .from("integrations")
        .select("id,settings")
        .eq("organisation_id", state.organisationId)
        .eq("provider", "tiktok")
        .eq("provider_account_id", token.open_id)
        .maybeSingle(),
      previous =
        existing?.settings &&
        typeof existing.settings === "object" &&
        !Array.isArray(existing.settings)
          ? existing.settings
          : {},
      values = {
        provider_account_id: token.open_id,
        provider_account_name: accountName,
        status: "connected",
        access_token_encrypted: encryptToken(token.access_token),
        refresh_token_encrypted: encryptToken(token.refresh_token),
        token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        settings: {
          ...(previous as Record<string, Json>),
          openId: token.open_id,
          displayName: profile.displayName,
          username: profile.username,
          scopes,
          configurationStatus: "ready",
        } as Json,
        last_sync_status: "connected",
        last_sync_error: null,
      };
    const result = existing
      ? await supabase
          .from("integrations")
          .update(values)
          .eq("id", existing.id)
          .eq("organisation_id", state.organisationId)
      : await supabase
          .from("integrations")
          .insert({organisation_id: state.organisationId, provider: "tiktok", ...values})
          .select("id")
          .maybeSingle();
    if (result.error)
      throw new Error("TikTok authorized Metric Mage, but the account could not be saved.");
    const id = existing?.id ?? result.data?.id;
    if (id)
      await supabase.from("integration_logs").insert({
        organisation_id: state.organisationId,
        integration_id: id,
        provider: "tiktok",
        status: "finished",
        records_received: 0,
        events_imported: 0,
        events_skipped: 0,
        error_count: 0,
        metadata: {operation: "oauth_connected", scopes},
      });
    const stats = scopes.includes("user.info.stats") && scopes.includes("video.list");
    return back(
      url,
      "success",
      stats
        ? "TikTok connected. Click Sync now to import followers and recent posts."
        : "TikTok connected. Follower and video stats appear after TikTok approves those read permissions.",
    );
  } catch (error) {
    return back(url, "error", error instanceof Error ? error.message : "TikTok connection failed.");
  }
}
