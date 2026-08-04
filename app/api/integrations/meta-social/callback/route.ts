import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {exchangeCode, stateMatches} from "@/lib/integrations/meta-social/oauth";
import {MetaSocialClient} from "@/lib/integrations/meta-social/client";
import {metaSocialEnv} from "@/lib/integrations/meta-social/config";
import {encryptToken} from "@/lib/security/token-crypto";
import type {Json} from "@/types/database";

const back = (url: URL, kind: "error" | "success", message: string, path = "/app/integrations") =>
  NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`, url));

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await cookies();
  const raw = store.get("ghost_meta_social_oauth")?.value;
  store.delete("ghost_meta_social_oauth");
  if (url.searchParams.get("error")) return back(url, "error", "Meta Social authorization was denied.");

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
    /* ignore */
  }
  const code = url.searchParams.get("code");
  if (
    !state ||
    state.provider !== "meta_social" ||
    Date.now() - state.createdAt > 600_000 ||
    !stateMatches(state.state, url.searchParams.get("state")) ||
    !code
  ) {
    return back(url, "error", "Meta Social authorization expired or failed validation.");
  }

  try {
    const supabase = await createClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user || user.id !== state.userId) {
      throw new Error("Your Ghost session changed. Restart Meta Social authorization.");
    }
    const {data: member} = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", state.organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !hasPermission(member.role as OrganisationRole, "integration.manage")) {
      throw new Error("You no longer have permission to connect Meta Social here.");
    }

    const token = await exchangeCode(code);
    const client = new MetaSocialClient(token.access_token!);
    const [identity, permissions, discovered] = await Promise.all([
      client.identity(),
      client.permissions(),
      client.discoverAssets(),
    ]);
    const granted = permissions.filter((p) => p.status === "granted").map((p) => p.permission);
    const declined = permissions.filter((p) => p.status !== "granted").map((p) => p.permission);
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const {data: existing} = await supabase
      .from("integrations")
      .select("id,settings")
      .eq("organisation_id", state.organisationId)
      .eq("provider", "meta_social")
      .eq("provider_account_id", identity.id)
      .maybeSingle();
    const old =
      existing?.settings && typeof existing.settings === "object" && !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, Json>)
        : {};
    const previous = Array.isArray(old.assets)
      ? (old.assets as {id?: string; selected?: boolean}[])
      : [];
    const eligible = discovered.assets.filter((a) => a.accessState === "available");

    const values = {
      provider_account_id: identity.id,
      provider_account_name: identity.name,
      status: "connected",
      access_token_encrypted: encryptToken(token.access_token!),
      refresh_token_encrypted: null,
      token_expires_at: expiresAt,
      settings: {
        ...old,
        metaUserId: identity.id,
        metaUserName: identity.name,
        assets: discovered.assets.map((a) => ({
          ...a,
          selected:
            previous.find((p) => p.id === a.id)?.selected ??
            (eligible.length === 1 && a.id === eligible[0]?.id),
        })),
        grantedPermissions: granted,
        declinedPermissions: declined,
        tokenIssuedAt: new Date().toISOString(),
        graphApiVersion: metaSocialEnv().version,
        configurationStatus: eligible.length === 1 ? "ready" : "property_required",
        initialSyncComplete: Boolean(old.initialSyncComplete),
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
      : await supabase.from("integrations").insert({
          organisation_id: state.organisationId,
          provider: "meta_social",
          ...values,
        });
    if (result.error) {
      throw new Error("Meta authorized Ghost, but the social integration could not be saved.");
    }
    return back(
      url,
      "success",
      `Meta Social connected as ${identity.name}. Select Pages and Instagram accounts to sync.`,
      state.returnTo,
    );
  } catch (error) {
    return back(url, "error", error instanceof Error ? error.message : "Meta Social connection failed.");
  }
}
