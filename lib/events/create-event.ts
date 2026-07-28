import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { NormalisedEventInput } from "@/types/events";
import { normaliseEvent } from "./normalise-event";
import {hasPermission,type OrganisationRole} from "@/lib/auth/permissions";

export type CreateEventResult = { ok:true; id:string; duplicate:boolean } | { ok:false; message:string };
export function isDuplicateEventError(error:{code?:string}|null){return error?.code==="23505"}
export async function createEvent(supabase: SupabaseClient<Database>, userId: string, input: NormalisedEventInput): Promise<CreateEventResult> {
  const normalised = normaliseEvent(input);
  const { data: membership } = await supabase.from("organisation_members").select("id,role,status")
    .eq("user_id", userId).eq("organisation_id", normalised.organisationId).eq("status","active").maybeSingle();
  if (!membership) return { ok:false, message:"You do not have access to this organisation." };
  if(!hasPermission(membership.role as OrganisationRole,"event.create"))return{ok:false,message:"Your organisation role is read-only."};
  if (normalised.integrationId) {
    const { data: integration } = await supabase.from("integrations").select("id")
      .eq("id", normalised.integrationId).eq("organisation_id", normalised.organisationId).maybeSingle();
    if (!integration) return { ok:false, message:"The selected integration is not available." };
  }
  if (normalised.externalId) {
    const { data: existing } = await supabase.from("events").select("id")
      .eq("organisation_id", normalised.organisationId).eq("source", normalised.source)
      .eq("external_id", normalised.externalId).maybeSingle();
    if (existing) return { ok:true, id:existing.id, duplicate:true };
  }
  const { data, error } = await supabase.from("events").insert({
    organisation_id:normalised.organisationId, integration_id:normalised.integrationId ?? null,
    source:normalised.source, category:normalised.category, event_type:normalised.eventType,
    title:normalised.title, description:normalised.description ?? null, severity:normalised.severity,
    occurred_at:normalised.occurredAt, external_id:normalised.externalId ?? null,
    raw_payload:(normalised.rawPayload ?? {}) as Json, metadata:(normalised.metadata ?? {}) as Json,
  }).select("id").single();
  if (isDuplicateEventError(error) && normalised.externalId) {
    const {data:existing}=await supabase.from("events").select("id").eq("organisation_id",normalised.organisationId).eq("source",normalised.source).eq("external_id",normalised.externalId).maybeSingle();
    if(existing)return {ok:true,id:existing.id,duplicate:true};
  }
  if (error || !data) return { ok:false, message:"The event could not be saved." };
  return { ok:true, id:data.id, duplicate:false };
}
