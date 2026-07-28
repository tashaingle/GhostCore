import "server-only";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {requireUser} from "@/lib/auth/user";
import {selectActiveMembership} from "./selection";
export const ACTIVE_ORGANISATION_COOKIE="ghost_active_organisation";
export async function getActiveOrganisation(optional=false){
  const{supabase,user}=await requireUser();
  const{data:memberships,error}=await supabase.from("organisation_members").select("id,organisation_id,role,status,created_at,organisations(id,name,slug,logo_url,website,industry,timezone,default_currency)").eq("user_id",user.id).eq("status","active").order("created_at");
  if(error)throw new Error("Unable to load your organisations.");
  const valid=(memberships??[]).flatMap(membership=>{const organisation=Array.isArray(membership.organisations)?membership.organisations[0]:membership.organisations;return organisation?[{membership,organisation}]:[]});
  if(!valid.length){if(optional)return null;redirect("/app/onboarding")}
  const cookieStore=await cookies(),cookieId=cookieStore.get(ACTIVE_ORGANISATION_COOKIE)?.value;
  const{data:profile}=await supabase.from("profiles").select("active_organisation_id").eq("id",user.id).maybeSingle();
  const selected=selectActiveMembership(valid.map(item=>({organisation_id:item.organisation.id,organisation:item.organisation,membership:item.membership})),cookieId,profile?.active_organisation_id)!;
  if(cookieId!==selected.organisation.id){try{cookieStore.set(ACTIVE_ORGANISATION_COOKIE,selected.organisation.id,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:31536000})}catch{}}
  if(profile?.active_organisation_id!==selected.organisation.id)await supabase.from("profiles").update({active_organisation_id:selected.organisation.id}).eq("id",user.id);
  return{supabase,user,membership:selected.membership,organisation:selected.organisation,organisations:valid.map(item=>({id:item.organisation.id,name:item.organisation.name,slug:item.organisation.slug,logoUrl:item.organisation.logo_url,role:item.membership.role}))};
}
