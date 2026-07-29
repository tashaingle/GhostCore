import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "@/types/database";
import {createEvent} from "@/lib/events/create-event";
import {decryptToken,encryptToken} from "@/lib/security/token-crypto";
import {loadConnector} from "./loader";
import {GitHubApiError} from "./github/api";
import type {IntegrationConnector,IntegrationSyncContext} from "./connector";
import {GoogleAnalyticsError} from "./google-analytics/errors";
import {GmailError} from "./gmail/errors";
import {GhostStripeError} from "./stripe/errors";
import {SearchConsoleError} from "./google-search-console/client";
import{ShopifyError}from"./shopify/client";
import{MetaAdsError}from"./meta-ads/client";
export type SyncSummary={provider:string;received:number;imported:number;skipped:number;errors:number;durationMs:number;rateLimited:boolean};
type RunnerInput={supabase:SupabaseClient<Database>;userId:string;organisationId:string;integrationId:string};
type WriteResult={ok:boolean;duplicate?:boolean};
export async function processConnectorBatch(connector:IntegrationConnector,context:IntegrationSyncContext,write:(event:Parameters<typeof createEvent>[2])=>Promise<WriteResult>){
  const batch=await connector.sync(context);let imported=0,skipped=Math.max(0,batch.received-batch.events.length),errors=0;
  for(const event of batch.events){const result=await write(event);if(result.ok){if(result.duplicate)skipped++;else imported++}else errors++}
  return{received:batch.received,imported,skipped,errors,rateLimited:Boolean(batch.rateLimited),...(batch.credentials?{credentials:batch.credentials}:{}),...(batch.settings?{settings:batch.settings}:{}),...(batch.pages!==undefined?{pages:batch.pages}:{}),...(batch.filtered!==undefined?{filtered:batch.filtered}:{})};
}
export function completedLog(summary:{received:number;imported:number;skipped:number;errors:number;rateLimited:boolean},finishedAt:string,durationMs:number){
  return{status:summary.errors?"partial":"finished",finished_at:finishedAt,duration_ms:durationMs,records_received:summary.received,events_imported:summary.imported,events_skipped:summary.skipped,error_count:summary.errors,rate_limited:summary.rateLimited};
}
export async function runIntegrationSync(input:RunnerInput):Promise<SyncSummary>{
  const started=Date.now();const startedAt=new Date(started).toISOString();
  const {data:integration,error:loadError}=await input.supabase.from("integrations").select("id,provider,status,access_token_encrypted,refresh_token_encrypted,token_expires_at,settings").eq("id",input.integrationId).eq("organisation_id",input.organisationId).maybeSingle();
  if(loadError||!integration)throw new Error("Integration was not found.");
  const credential=integration.access_token_encrypted?decryptToken(integration.access_token_encrypted):undefined;const refreshToken=integration.refresh_token_encrypted?decryptToken(integration.refresh_token_encrypted):undefined;
  const connector=loadConnector(integration.provider,{accessToken:credential,refreshToken,expiresAt:integration.token_expires_at??undefined,settings:integration.settings as Record<string,unknown>});
  const{data:locked,error:lockError}=await input.supabase.rpc("acquire_integration_sync_lock",{target_integration_id:integration.id,target_organisation_id:input.organisationId});if(lockError||!locked)throw new Error("This integration is already syncing. Try again shortly.");
  const {data:log}=await input.supabase.from("integration_logs").insert({organisation_id:input.organisationId,integration_id:integration.id,provider:integration.provider,status:"started",started_at:startedAt}).select("id").maybeSingle();
  await input.supabase.from("integrations").update({status:"syncing",last_sync_status:"syncing",last_sync_error:null}).eq("id",integration.id).eq("organisation_id",input.organisationId);
  try{
    const health=await connector.healthCheck({organisationId:input.organisationId,integrationId:integration.id,receivedAt:startedAt});
    if(health==="expired")throw connector.healthError?.()??new GitHubApiError("unauthorized","Provider authorization has expired. Reconnect the integration.");
    if(health==="error")throw connector.healthError?.()??new Error("Provider health check failed.");
    const batch=await processConnectorBatch(connector,{organisationId:input.organisationId,integrationId:integration.id,receivedAt:startedAt},event=>createEvent(input.supabase,input.userId,event));
    const {imported,skipped,errors}=batch;const finishedAt=new Date().toISOString();const durationMs=Date.now()-started;const partial=errors>0;
    await input.supabase.from("integrations").update({status:partial?"error":"connected",last_sync_at:finishedAt,last_sync_status:partial?"partial":"success",last_sync_error:partial?`${errors} events could not be inserted.`:null,...(batch.credentials?{access_token_encrypted:encryptToken(batch.credentials.accessToken),refresh_token_encrypted:batch.credentials.refreshToken?encryptToken(batch.credentials.refreshToken):integration.refresh_token_encrypted,token_expires_at:batch.credentials.expiresAt??null}:{}),...(batch.settings?{settings:batch.settings as Json}:{})}).eq("id",integration.id).eq("organisation_id",input.organisationId);
    if(log)await input.supabase.from("integration_logs").update({...completedLog(batch,finishedAt,durationMs),metadata:{pagesRequested:batch.pages,messagesFiltered:batch.filtered,syncMode:String(batch.settings?.lastSyncMode??"standard")}}).eq("id",log.id).eq("organisation_id",input.organisationId);
    await input.supabase.rpc("release_integration_sync_lock",{target_integration_id:integration.id,target_organisation_id:input.organisationId});return{provider:integration.provider,received:batch.received,imported,skipped,errors,durationMs,rateLimited:batch.rateLimited};
  }catch(error){
    const finishedAt=new Date().toISOString();const durationMs=Date.now()-started;const rateLimited=error instanceof GitHubApiError&&error.kind==="rate_limit"||error instanceof GoogleAnalyticsError&&error.kind==="rate_limit"||error instanceof GmailError&&error.kind==="rate_limit"||error instanceof GhostStripeError&&error.kind==="rate_limit"||error instanceof SearchConsoleError&&error.kind==="rate_limit"||error instanceof ShopifyError&&error.kind==="rate_limit"||error instanceof MetaAdsError&&error.kind==="rate_limit";const expired=error instanceof GitHubApiError&&error.kind==="unauthorized"||error instanceof GoogleAnalyticsError&&error.kind==="unauthorized"||error instanceof GmailError&&error.kind==="unauthorized"||error instanceof GhostStripeError&&error.kind==="unauthorized"||error instanceof SearchConsoleError&&error.kind==="unauthorized"||error instanceof ShopifyError&&error.kind==="unauthorized"||error instanceof MetaAdsError&&error.kind==="unauthorized";const message=error instanceof Error?error.message:"Integration sync failed.";
    await input.supabase.from("integrations").update({status:expired?"expired":"error",last_sync_status:"error",last_sync_error:message.slice(0,500)}).eq("id",integration.id).eq("organisation_id",input.organisationId);
    if(log)await input.supabase.from("integration_logs").update({status:"error",finished_at:finishedAt,duration_ms:durationMs,error_count:1,rate_limited:rateLimited,error_message:message.slice(0,500)}).eq("id",log.id).eq("organisation_id",input.organisationId);
    await input.supabase.rpc("release_integration_sync_lock",{target_integration_id:input.integrationId,target_organisation_id:input.organisationId});throw error;
  }
}
