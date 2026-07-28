import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {exchangeGoogleCode,validateOAuthState} from "@/lib/integrations/google-analytics/oauth";
import {encryptToken} from "@/lib/security/token-crypto";
import {googleOAuthCallbackMessage} from "@/lib/integrations/google-analytics/errors";
const back=(origin:string,kind:"error"|"success",message:string,path="/app/integrations")=>NextResponse.redirect(new URL(`${path}?${kind}=${encodeURIComponent(message)}`,origin));
export async function GET(request:Request){
  const url=new URL(request.url),store=await cookies(),expectedState=store.get("ghost_ga4_state")?.value,verifier=store.get("ghost_ga4_verifier")?.value;
  store.delete("ghost_ga4_state");store.delete("ghost_ga4_verifier");
  const denied=url.searchParams.get("error");if(denied)return back(url.origin,"error",googleOAuthCallbackMessage(denied));
  if(!validateOAuthState(expectedState,url.searchParams.get("state")))return back(url.origin,"error","Google OAuth state validation failed. Restart the connection.");
  const code=url.searchParams.get("code");if(!code)return back(url.origin,"error","Google authorization returned no code.");if(!verifier)return back(url.origin,"error","Google OAuth verifier expired. Restart the connection.");
  try{
    const ctx=await getActiveOrganisation();if(!ctx)throw new Error("Your Ghost session expired.");requireOrganisationAdmin(ctx.membership.role);
    const tokens=await exchangeGoogleCode(code,verifier);
    const userResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const account=userResponse.ok?await userResponse.json() as {sub?:string;email?:string}:{};
    const {data:existing}=await ctx.supabase.from("integrations").select("id,refresh_token_encrypted").eq("organisation_id",ctx.organisation.id).eq("provider","google_analytics").order("created_at").limit(1).maybeSingle();
    if(!tokens.refresh_token&&!existing?.refresh_token_encrypted)throw new Error("Google returned no refresh token. Remove Ghost access from your Google account and reconnect.");
    const values={provider_account_id:account.sub??null,provider_account_name:account.email??"Google account",status:"connected",access_token_encrypted:encryptToken(tokens.access_token),refresh_token_encrypted:tokens.refresh_token?encryptToken(tokens.refresh_token):existing?.refresh_token_encrypted??null,token_expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),settings:{configurationStatus:"property_required"},last_sync_status:"connected",last_sync_error:null};
    const result=existing?await ctx.supabase.from("integrations").update(values).eq("id",existing.id).eq("organisation_id",ctx.organisation.id):await ctx.supabase.from("integrations").insert({organisation_id:ctx.organisation.id,provider:"google_analytics",...values});
    if(result.error)throw new Error("Google was authorized, but the integration could not be saved.");
    return back(url.origin,"success","Google connected. Choose a GA4 property.","/app/integrations/google-analytics/properties");
  }catch(error){const message=error instanceof Error?error.message:"Google Analytics connection failed.";if(process.env.NODE_ENV==="development")console.error("Google Analytics OAuth callback failed",{message});return back(url.origin,"error",message)}
}
