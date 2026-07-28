import "server-only";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {ACTIVE_ORGANISATION_COOKIE} from "./active";
export async function organisationApiContext(){const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();if(!user)return null;const preferred=(await cookies()).get(ACTIVE_ORGANISATION_COOKIE)?.value;let query=supabase.from("organisation_members").select("id,organisation_id,role,status").eq("user_id",user.id).eq("status","active");if(preferred)query=query.eq("organisation_id",preferred);let{data:membership}=await query.order("created_at").limit(1).maybeSingle();if(!membership&&preferred){const fallback=await supabase.from("organisation_members").select("id,organisation_id,role,status").eq("user_id",user.id).eq("status","active").order("created_at").limit(1).maybeSingle();membership=fallback.data}return membership?{supabase,user,membership,organisationId:membership.organisation_id}:null}
