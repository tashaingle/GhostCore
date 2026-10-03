import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {exchangeOutlookCode, stateMatches} from "@/lib/integrations/outlook/oauth";
import {OutlookClient} from "@/lib/integrations/outlook/client";
import {mailboxAddress} from "@/lib/integrations/outlook/connector";
import {encryptToken} from "@/lib/security/token-crypto";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";

const back = (url: URL, kind: "error" | "success", msg: string) =>
  NextResponse.redirect(new URL(`/app/integrations?${kind}=${encodeURIComponent(msg)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code"),
    expected = store.get("outlook_oauth_state")?.value,
    verifier = store.get("outlook_pkce")?.value,
    organisationId = store.get("outlook_oauth_org")?.value;
  store.delete("outlook_oauth_state");
  store.delete("outlook_pkce");
  store.delete("outlook_oauth_org");
  if (url.searchParams.get("error"))
    return back(url, "error", "Outlook wasn't connected because access wasn't approved.");
  if (!stateMatches(expected, state) || !code || !verifier || !organisationId)
    return back(url, "error", "That took too long or didn't match. Connect Outlook again.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in and connect Outlook again.");
    const {data: membership} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !hasPermission(membership.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect Outlook here.");

    const tokens = await exchangeOutlookCode(code, verifier),
      expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      profile = await new OutlookClient({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt,
      }).profile(),
      mailbox = mailboxAddress(profile);
    if (!mailbox) throw new Error("Microsoft didn't share this mailbox's address. Try again.");

    const {data: existing} = await supabase
      .from("integrations")
      .select("id,refresh_token_encrypted,settings")
      .eq("organisation_id", organisationId)
      .eq("provider", "outlook")
      .eq("provider_account_id", mailbox)
      .maybeSingle();
    const previous = (existing?.settings ?? {}) as Record<string, unknown>;
    const values = {
      provider_account_id: mailbox,
      provider_account_name: mailbox,
      status: "connected",
      access_token_encrypted: encryptToken(tokens.access_token!),
      refresh_token_encrypted: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : (existing?.refresh_token_encrypted ?? null),
      token_expires_at: expiresAt,
      settings: {
        // Reconnecting keeps the person's choices and where syncing had got to.
        includeReceived: true,
        includeSent: true,
        includeUnread: true,
        includeAttachments: true,
        initialWindowDays: 7,
        initialSyncComplete: false,
        ...previous,
        mailboxEmail: mailbox,
        mailboxDomain: mailbox.split("@")[1] ?? null,
        displayName: profile.displayName ?? null,
        grantedScopes: tokens.scope ?? "",
      },
      last_sync_status: "connected",
      last_sync_error: null,
    };
    const result = existing
      ? await supabase
          .from("integrations")
          .update(values)
          .eq("id", existing.id)
          .eq("organisation_id", organisationId)
      : await supabase
          .from("integrations")
          .insert({organisation_id: organisationId, provider: "outlook", ...values});
    if (result.error) throw new Error("The Outlook mailbox couldn't be saved. Try again.");
    return back(
      url,
      "success",
      `Outlook connected as ${mailbox}. Click Sync now to bring in email.`,
    );
  } catch (error) {
    return back(
      url,
      "error",
      error instanceof Error ? error.message : "Outlook connection failed.",
    );
  }
}
