import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {exchangeVercelCode, vercelStateMatches} from "@/lib/integrations/vercel/oauth";
import {VercelClient, VercelError} from "@/lib/integrations/vercel/client";
import {selectedVercelProjects} from "@/lib/integrations/vercel/connector";
import {encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies(),
    raw = store.get("ghost_vercel_oauth")?.value;
  store.delete("ghost_vercel_oauth");
  if (url.searchParams.get("error")) return back(url, "error", "Vercel authorization was denied.");
  let state:
    | {
        state: string;
        userId: string;
        organisationId: string;
        provider: string;
        returnTo: string;
        createdAt: number;
      }
    | undefined;
  try {
    state = raw ? JSON.parse(raw) : undefined;
  } catch {
    state = undefined;
  }
  const code = url.searchParams.get("code");
  if (
    !state ||
    state.provider !== "vercel" ||
    Date.now() - state.createdAt > 600000 ||
    !vercelStateMatches(state.state, url.searchParams.get("state")) ||
    !code
  )
    return back(url, "error", "Vercel authorization expired or failed validation.");
  try {
    const supabase = await createClient(),
      {
        data: {user},
      } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId)
      throw new Error("Your Metric Mage session changed. Restart Vercel authorization.");
    const {data: member} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", state.organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !hasPermission(member.role as OrganisationRole, "integration.manage"))
      throw new Error("You no longer have permission to connect Vercel here.");
    const token = await exchangeVercelCode(code),
      queryTeam = url.searchParams.get("teamId"),
      tokenTeam = token.team_id ?? null;
    if (queryTeam && tokenTeam && queryTeam !== tokenTeam)
      throw new Error("Vercel account did not match the authorization.");
    const configurationId = url.searchParams.get("configurationId");
    if (configurationId && configurationId !== token.installation_id)
      throw new Error("Vercel installation did not match the authorization.");
    const teamId = tokenTeam ?? queryTeam,
      client = new VercelClient(token.access_token),
      accountName = await client.accountName(teamId),
      accountId = teamId || token.user_id,
      {data: existing} = await supabase
        .from("integrations")
        .select("id,settings")
        .eq("organisation_id", state.organisationId)
        .eq("provider", "vercel")
        .eq("provider_account_id", accountId)
        .maybeSingle(),
      old =
        existing?.settings &&
        typeof existing.settings === "object" &&
        !Array.isArray(existing.settings)
          ? (existing.settings as Record<string, Json>)
          : {},
      selected = selectedVercelProjects(old),
      values = {
        provider_account_id: accountId,
        provider_account_name: accountName,
        status: "connected",
        access_token_encrypted: encryptToken(token.access_token),
        refresh_token_encrypted: null,
        token_expires_at: null,
        settings: {
          ...old,
          installationId: token.installation_id,
          configurationId: configurationId || token.installation_id,
          teamId,
          userId: token.user_id,
          selectedProjectIds: selected,
          configurationStatus: selected.length ? "ready" : "property_required",
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
          .insert({organisation_id: state.organisationId, provider: "vercel", ...values})
          .select("id")
          .maybeSingle();
    if (result.error)
      throw new Error("Vercel authorized Metric Mage, but the account could not be saved.");
    const id = existing?.id ?? result.data?.id;
    if (id)
      await supabase.from("integration_logs").insert({
        organisation_id: state.organisationId,
        integration_id: id,
        provider: "vercel",
        status: "finished",
        records_received: 0,
        events_imported: 0,
        events_skipped: 0,
        error_count: 0,
        metadata: {operation: "oauth_connected", teamId, installationId: token.installation_id},
      });
    return back(
      url,
      "success",
      "Vercel connected. Choose which projects to watch.",
      state.returnTo,
    );
  } catch (error) {
    const message =
      error instanceof VercelError || error instanceof Error
        ? error.message
        : "Vercel connection failed.";
    return back(url, "error", message);
  }
}
