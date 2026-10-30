"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {requireUser} from "@/lib/auth/user";
import {consentPath, isAuthorizationId, isClientRedirect} from "@/lib/mcp/consent";

const settings = (kind: "error" | "success", message: string) =>
  `/app/settings?${kind}=${encodeURIComponent(message)}#claude`;

async function decide(form: FormData, approve: boolean) {
  const id = form.get("authorizationId");
  if (!isAuthorizationId(id))
    redirect(settings("error", "That request to connect Claude wasn't valid."));
  const {supabase} = await requireUser();
  const {data, error} = approve
    ? await supabase.auth.oauth.approveAuthorization(id, {skipBrowserRedirect: true})
    : await supabase.auth.oauth.denyAuthorization(id, {skipBrowserRedirect: true});
  if (error || !data || !isClientRedirect(data.redirect_url))
    redirect(
      `${consentPath(id)}&error=${encodeURIComponent("That didn't work. Start connecting again from Claude.")}`,
    );
  // Back to Claude with the authorisation code (or the refusal).
  redirect(data.redirect_url);
}

export async function approveClaude(form: FormData) {
  await decide(form, true);
}

export async function denyClaude(form: FormData) {
  await decide(form, false);
}

/** Disconnects Claude: Supabase revokes the consent and every token it issued for that client. */
export async function revokeClaude(form: FormData) {
  const clientId = z.uuid().safeParse(form.get("clientId"));
  if (!clientId.success) redirect(settings("error", "That connection couldn't be found."));
  const {supabase} = await requireUser();
  const {error} = await supabase.auth.oauth.revokeGrant({clientId: clientId.data});
  if (error) redirect(settings("error", "That connection couldn't be removed. Try again."));
  redirect(settings("success", "Disconnected. Claude can no longer read your Metric Mage data."));
}
