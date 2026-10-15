import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";

type Provider = "meta_ads" | "meta_social";
type Row = {id: string; settings: Database["public"]["Tables"]["integrations"]["Row"]["settings"]};

/**
 * Each organisation has one connection per Meta provider. Reconnecting replaces it, even when the
 * Facebook account looks new: Meta gives the same person a different ID in each Meta app, so a
 * move to a new app would otherwise leave the old connection beside the new one.
 */
export function pickMetaConnection<T extends {provider_account_id: string | null}>(
  rows: T[],
  metaUserId: string,
): T | null {
  return rows.find((r) => r.provider_account_id === metaUserId) ?? rows[0] ?? null;
}

/** The connection a new Meta login should update, if this organisation already has one. */
export async function existingMetaConnection(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  provider: Provider,
  metaUserId: string,
): Promise<Row | null> {
  const {data} = await supabase
    .from("integrations")
    .select("id,settings,provider_account_id")
    .eq("organisation_id", organisationId)
    .eq("provider", provider)
    .order("created_at");
  return pickMetaConnection(data ?? [], metaUserId);
}

/** Deletes any other connections for this provider, leaving the one just saved. */
export async function removeOtherMetaConnections(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  provider: Provider,
  keepId: string,
) {
  await supabase
    .from("integrations")
    .delete()
    .eq("organisation_id", organisationId)
    .eq("provider", provider)
    .neq("id", keepId);
}
