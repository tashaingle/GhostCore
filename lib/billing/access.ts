import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {hasAccess} from "./plan";
import {billingEnabled} from "./stripe";

/**
 * For background work (no signed-in user): whether an organisation's creator has an active
 * subscription. Always true while billing is switched off.
 */
export async function organisationBillingActive(
  client: SupabaseClient<Database>,
  organisationId: string,
) {
  if (!billingEnabled()) return true;
  const {data: organisation} = await client
    .from("organisations")
    .select("created_by")
    .eq("id", organisationId)
    .maybeSingle();
  if (!organisation) return false;
  const {data: account} = await client
    .from("billing_accounts")
    .select("status,comped")
    .eq("user_id", organisation.created_by)
    .maybeSingle();
  return hasAccess(account);
}
