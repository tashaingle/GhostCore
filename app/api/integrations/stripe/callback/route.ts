import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {encryptToken} from "@/lib/security/token-crypto";
import {hasPermission,type OrganisationRole} from "@/lib/auth/permissions";
import {exchangeStripeCode,stateMatches} from "@/lib/integrations/stripe/oauth";
import {stripeClient} from "@/lib/integrations/stripe/client";
import {STRIPE_OAUTH_COOKIE} from "@/lib/integrations/stripe/config";
const back=(url:URL,kind:"error"|"success",message:string)=>NextResponse.redirect(new URL(`/app/integrations?${kind}=${encodeURIComponent(message)}`,url));
const clean=(v:unknown,n=200)=>String(v??"").replace(/[\u0000-\u001f\u007f<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
export async function GET(request:Request){
  const url=new URL(request.url),store=await cookies(),raw=store.get(STRIPE_OAUTH_COOKIE)?.value;store.delete(STRIPE_OAUTH_COOKIE);
  if(url.searchParams.get("error"))return back(url,"error",clean(url.searchParams.get("error_description")||"Stripe authorisation was denied."));
  let stateData:{digest:string;organisationId:string;issuedAt:number}|undefined;try{stateData=raw?JSON.parse(raw):undefined}catch{}
  const state=url.searchParams.get("state"),code=url.searchParams.get("code");
  if(!stateData||Date.now()-stateData.issuedAt>600_000||!stateMatches(stateData.digest,state)||!code)return back(url,"error","Stripe authorization expired or failed validation. Try again.");
  try{
    const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Your session expired. Sign in and reconnect Stripe.");
    const{data:membership}=await supabase.from("organisation_members").select("role").eq("organisation_id",stateData.organisationId).eq("user_id",user.id).eq("status","active").maybeSingle();
    if(!membership||!hasPermission(membership.role as OrganisationRole,"integration.manage"))throw new Error("You no longer have permission to connect Stripe here.");
    const token=await exchangeStripeCode(code),accountId=token.stripe_user_id;if(!accountId)throw new Error("Stripe did not return a connected account ID.");
    const mode=token.livemode?"live":"test",account=await stripeClient().accounts.retrieve(accountId),name=clean(account.business_profile?.name||account.settings?.dashboard?.display_name||`Stripe ${accountId.slice(-6)}`);
    const{data:existing}=await supabase.from("integrations").select("id,status,settings").eq("organisation_id",stateData.organisationId).eq("provider","stripe").eq("provider_account_id",accountId).maybeSingle();
    const existingMode=existing&&typeof existing.settings==="object"&&!Array.isArray(existing.settings)?(existing.settings as Record<string,unknown>).mode:undefined;
    if(existing&&existingMode&&existingMode!==mode)throw new Error("This Stripe account is already connected in another mode. Disconnect it before creating a separate mode connection.");
    const values={provider_account_id:accountId,provider_account_name:name,status:"connected",access_token_encrypted:token.access_token?encryptToken(token.access_token):null,refresh_token_encrypted:token.refresh_token?encryptToken(token.refresh_token):null,settings:{mode,accountId,accountName:name,country:clean(account.country,2),defaultCurrency:clean(account.default_currency,3).toLowerCase(),chargesEnabled:Boolean(account.charges_enabled),payoutsEnabled:Boolean(account.payouts_enabled),detailsSubmitted:Boolean(account.details_submitted),connectedAt:new Date().toISOString(),initialSyncComplete:false,syncPayments:true,syncInvoices:true,syncSubscriptions:true,syncPayouts:true,syncDisputes:true},last_sync_status:"connected",last_sync_error:null};
    const result=existing?await supabase.from("integrations").update(values).eq("id",existing.id).eq("organisation_id",stateData.organisationId):await supabase.from("integrations").insert({organisation_id:stateData.organisationId,provider:"stripe",...values});
    if(result.error)throw new Error(result.error.code==="23505"?"This Stripe account is already connected.":"The Stripe account could not be saved.");
    return back(url,"success",`Stripe connected: ${name} (${mode} mode).`);
  }catch(error){console.error("Stripe OAuth callback failed",error instanceof Error?error.message:"unknown");return back(url,"error",error instanceof Error?error.message:"Stripe connection failed.")}
}
