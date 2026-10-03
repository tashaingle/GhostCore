import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {
  exchangeMailchimpCode,
  mailchimpMetadata,
  stateMatches,
} from "@/lib/integrations/mailchimp/oauth";
import {MailchimpClient} from "@/lib/integrations/mailchimp/client";
import {encryptToken} from "@/lib/security/token-crypto";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", msg: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(msg)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    expected = store.get("mailchimp_oauth_state")?.value,
    organisationId = store.get("mailchimp_oauth_org")?.value,
    code = url.searchParams.get("code");
  store.delete("mailchimp_oauth_state");
  store.delete("mailchimp_oauth_org");
  if (url.searchParams.get("error"))
    return back(url, "error", "Mailchimp wasn't connected because access wasn't approved.");
  if (!stateMatches(expected, url.searchParams.get("state")) || !code || !organisationId)
    return back(url, "error", "That took too long or didn't match. Connect Mailchimp again.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in and connect Mailchimp again.");
    const {data: membership} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !hasPermission(membership.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect Mailchimp here.");

    const token = await exchangeMailchimpCode(code),
      meta = await mailchimpMetadata(token),
      audiences = await new MailchimpClient(token, meta.api_endpoint).audiences(),
      accountId = String(meta.user_id ?? meta.accountname ?? meta.dc),
      name = meta.accountname || meta.login?.login_email || "Mailchimp";

    const {data: existing} = await supabase
      .from("integrations")
      .select("id,settings")
      .eq("organisation_id", organisationId)
      .eq("provider", "mailchimp")
      .eq("provider_account_id", accountId)
      .maybeSingle();
    const previous = (existing?.settings ?? {}) as Record<string, unknown>,
      chosen = new Map(
        ((previous.audiences as {id: string; selected?: boolean}[] | undefined) ?? []).map((a) => [
          a.id,
          a.selected,
        ]),
      );
    const values = {
      provider_account_id: accountId,
      provider_account_name: name,
      status: "connected",
      // Mailchimp tokens don't expire, so there's no refresh token or expiry.
      access_token_encrypted: encryptToken(token),
      refresh_token_encrypted: null,
      token_expires_at: null,
      settings: {
        ...previous,
        dc: meta.dc,
        apiEndpoint: meta.api_endpoint,
        accountName: name,
        audiences: audiences.map((a) => ({
          id: a.id,
          name: a.name,
          selected: chosen.get(a.id) ?? true,
        })),
      } as Json,
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
          .insert({organisation_id: organisationId, provider: "mailchimp", ...values});
    if (result.error) throw new Error("The Mailchimp account couldn't be saved. Try again.");
    return audiences.length > 1
      ? back(
          url,
          "success",
          `Mailchimp connected (${name}). Untick any audiences you don't want included, then click Sync now.`,
          "/app/integrations/mailchimp/settings",
        )
      : back(
          url,
          "success",
          `Mailchimp connected (${name}). Click Sync now to bring in your data.`,
        );
  } catch (error) {
    return back(
      url,
      "error",
      error instanceof Error ? error.message : "Mailchimp connection failed.",
    );
  }
}
