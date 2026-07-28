import { NextResponse } from "next/server";
import { encryptToken } from "@/lib/security/token-crypto";
import { GitHubApi } from "@/lib/integrations/github/api";
import { createClient } from "@/lib/supabase/server";
import {cookies} from "next/headers";
import {ACTIVE_ORGANISATION_COOKIE} from "@/lib/organisations/active";

const back=(origin:string,kind:"error"|"success",message:string)=>NextResponse.redirect(new URL(`/app/integrations?${kind}=${encodeURIComponent(message)}`,origin));
export async function GET(request:Request){
  const url=new URL(request.url);const code=url.searchParams.get("code");const oauthError=url.searchParams.get("error_description")||url.searchParams.get("error");const oauthCode=url.searchParams.get("error_code");
  if(oauthError)return back(url.origin,"error",`GitHub authorization failed: ${oauthError}${oauthCode?` (${oauthCode})`:""}`);
  if(!code)return back(url.origin,"error","GitHub authorization returned without a code.");
  try{
    const supabase=await createClient();const {data,error}=await supabase.auth.exchangeCodeForSession(code);
    if(error)throw new Error(`Supabase OAuth code exchange failed: ${error.message}${error.code?` [${error.code}]`:""}`);
    const providerToken=data.session?.provider_token;
    if(!data.session)throw new Error("Supabase OAuth code exchange returned no authenticated session.");
    if(!providerToken)throw new Error("GitHub authorization returned no provider access token. Restart the connection.");
    const session=data.session;const account=await new GitHubApi(providerToken).user();
    const preferred=(await cookies()).get(ACTIVE_ORGANISATION_COOKIE)?.value;let membershipQuery=supabase.from("organisation_members").select("organisation_id").eq("user_id",session.user.id).eq("status","active");if(preferred)membershipQuery=membershipQuery.eq("organisation_id",preferred);let {data:membership}=await membershipQuery.order("created_at").limit(1).maybeSingle();if(!membership&&preferred)membership=(await supabase.from("organisation_members").select("organisation_id").eq("user_id",session.user.id).eq("status","active").order("created_at").limit(1).maybeSingle()).data;
    if(!membership)throw new Error("Create an organisation before connecting GitHub.");
    const token=encryptToken(providerToken);const refresh=session.provider_refresh_token?encryptToken(session.provider_refresh_token):null;
    const {data:existing}=await supabase.from("integrations").select("id").eq("organisation_id",membership.organisation_id).eq("provider","github").order("created_at").limit(1).maybeSingle();
    const values={provider_account_id:String(account.id),provider_account_name:account.login,status:"connected",access_token_encrypted:token,refresh_token_encrypted:refresh,token_expires_at:null,settings:{avatar_url:account.avatar_url,name:account.name},last_sync_status:"connected",last_sync_error:null};
    const result=existing?await supabase.from("integrations").update(values).eq("id",existing.id).eq("organisation_id",membership.organisation_id):await supabase.from("integrations").insert({organisation_id:membership.organisation_id,provider:"github",...values});
    if(result.error)throw new Error("GitHub was authorized, but the integration record could not be saved.");
    // Supabase returns the provider token only on the OAuth exchange. Refreshing
    // immediately replaces the persisted SSR session with one that omits it.
    const {error:refreshError}=await supabase.auth.refreshSession({refresh_token:session.refresh_token});
    if(refreshError){await supabase.auth.signOut();throw new Error("GitHub connected, but the browser session could not be secured. Sign in again.");}
    return back(url.origin,"success",`GitHub account @${account.login} connected. You can sync now.`);
  }catch(error){
    const message=error instanceof Error?error.message:"GitHub connection failed.";
    if(process.env.NODE_ENV==="development")console.error("GitHub OAuth callback failed",{message});
    return back(url.origin,"error",message);
  }
}
