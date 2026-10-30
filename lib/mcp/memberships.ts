import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";

/**
 * Every organisation someone is an active member of, oldest first, across all their workspaces.
 * Access is decided per organisation by organisation_members, so this is the full set Claude may
 * see. Pass a client signed in as that user so RLS also applies.
 */
export async function activeMemberships(supabase: SupabaseClient<Database>, userId: string) {
  const {data: memberships, error} = await supabase
    .from("organisation_members")
    .select(
      "id,organisation_id,role,status,created_at,organisations(id,name,slug,timezone,default_currency)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at");
  if (error) throw new Error("Unable to load your organisations.");
  return (memberships ?? []).flatMap((membership) => {
    const organisation = Array.isArray(membership.organisations)
      ? membership.organisations[0]
      : membership.organisations;
    return organisation ? [{membership, organisation}] : [];
  });
}
