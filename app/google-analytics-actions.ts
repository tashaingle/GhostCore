"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {decryptToken,encryptToken} from "@/lib/security/token-crypto";
import {GoogleAnalyticsClient} from "@/lib/integrations/google-analytics/client";
import {validatePropertySelection} from "@/lib/integrations/google-analytics/property-discovery";
const target=(kind:"error"|"success",message:string)=>`/app/integrations/google-analytics/properties?${kind}=${encodeURIComponent(message)}`;
export async function selectGoogleAnalyticsProperty(form:FormData){
  const propertyId=String(form.get("propertyId")||"");const ctx=await getActiveOrganisation();if(!ctx)redirect("/app/onboarding");requireOrganisationAdmin(ctx.membership.role);
  const {data:integration}=await ctx.supabase.from("integrations").select("id,access_token_encrypted,refresh_token_encrypted,token_expires_at,settings").eq("organisation_id",ctx.organisation.id).eq("provider","google_analytics").order("created_at").limit(1).maybeSingle();
  if(!integration?.access_token_encrypted)redirect(target("error","Reconnect Google Analytics before choosing a property."));
  try{
    const client=new GoogleAnalyticsClient({accessToken:decryptToken(integration.access_token_encrypted),refreshToken:integration.refresh_token_encrypted?decryptToken(integration.refresh_token_encrypted):undefined,expiresAt:integration.token_expires_at??undefined});
    const properties=await client.discoverProperties(),selected=validatePropertySelection(propertyId,properties),details=await client.property(propertyId),credentials=client.credentialUpdate();
    const {error}=await ctx.supabase.from("integrations").update({provider_account_name:selected.propertyName,status:"connected",settings:{propertyId:selected.propertyId,propertyName:selected.propertyName,accountId:selected.accountId,accountName:selected.accountName,timeZone:details.timeZone??"UTC",configurationStatus:"ready"},last_sync_error:null,...(credentials?{access_token_encrypted:encryptToken(credentials.accessToken),refresh_token_encrypted:credentials.refreshToken?encryptToken(credentials.refreshToken):integration.refresh_token_encrypted,token_expires_at:credentials.expiresAt??null}:{})}).eq("id",integration.id).eq("organisation_id",ctx.organisation.id);
    if(error)throw new Error("The Analytics property selection could not be saved.");
    revalidatePath("/app/integrations");redirect(`/app/integrations?success=${encodeURIComponent(`${selected.propertyName} selected for Google Analytics.`)}`);
  }catch(error){if(error&&typeof error==="object"&&"digest"in error)throw error;redirect(target("error",error instanceof Error?error.message:"The Analytics property could not be selected."))}
}
