"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {runIntegrationSync} from "@/lib/integrations/sync-runner";
import {getProvider} from "@/lib/integrations/registry";
import {loadConnector} from "@/lib/integrations/loader";
import {decryptToken} from "@/lib/security/token-crypto";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {requirePermission} from "@/lib/auth/permissions";
import {runIntelligence} from "@/lib/intelligence/runner";
const destination=(kind:"error"|"success",message:string)=>`/app/integrations?${kind}=${encodeURIComponent(message)}`;
export async function syncIntegration(form:FormData){
  const integrationId=String(form.get("integrationId")||"");const ctx=await getActiveOrganisation();if(!ctx)redirect("/app/onboarding");requirePermission(ctx.membership.role,"integration.sync");
  try{
    const summary=await runIntegrationSync({supabase:ctx.supabase,userId:ctx.user.id,organisationId:ctx.organisation.id,integrationId});
    await runIntelligence(ctx.supabase,ctx.organisation.id);
    revalidatePath("/app");revalidatePath("/app/timeline");revalidatePath("/app/integrations");
    redirect(destination(summary.errors?"error":"success",`${getProvider(summary.provider)?.displayName??summary.provider} sync: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.errors} errors in ${summary.durationMs}ms.`));
  }catch(error){if(error&&typeof error==="object"&&"digest"in error)throw error;redirect(destination("error",error instanceof Error?error.message:"Integration sync failed."))}
}
export async function disconnectIntegration(form:FormData){
  const integrationId=String(form.get("integrationId")||"");const ctx=await getActiveOrganisation();if(!ctx)redirect("/app/onboarding");requireOrganisationAdmin(ctx.membership.role);
  const {data:integration}=await ctx.supabase.from("integrations").select("id,provider,access_token_encrypted,refresh_token_encrypted,token_expires_at,settings").eq("id",integrationId).eq("organisation_id",ctx.organisation.id).maybeSingle();
  if(!integration)redirect(destination("error","Integration was not found."));
  try{
    const credential=integration.access_token_encrypted?decryptToken(integration.access_token_encrypted):undefined;
    const connector=loadConnector(integration.provider,{accessToken:credential,refreshToken:integration.refresh_token_encrypted?decryptToken(integration.refresh_token_encrypted):undefined,expiresAt:integration.token_expires_at??undefined,settings:integration.settings as Record<string,unknown>});const result=await connector.disconnect({organisationId:ctx.organisation.id,integrationId:integration.id});
    if(!result.ok)throw new Error(result.message??"The provider could not be disconnected.");
    const {error}=await ctx.supabase.from("integrations").update({status:"disconnected",access_token_encrypted:null,refresh_token_encrypted:null,token_expires_at:null,last_sync_status:"disconnected",last_sync_error:null}).eq("id",integration.id).eq("organisation_id",ctx.organisation.id);
    if(error)throw new Error("Integration credentials could not be removed.");
    revalidatePath("/app/integrations");redirect(destination("success",`${getProvider(integration.provider)?.displayName??integration.provider} disconnected.`));
  }catch(error){if(error&&typeof error==="object"&&"digest"in error)throw error;redirect(destination("error",error instanceof Error?error.message:"Integration could not be disconnected."))}
}
