import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {createCodeVerifier,createOAuthState,googleAuthorisationUrl} from "@/lib/integrations/google-analytics/oauth";
import {googleOAuthEnv} from "@/lib/integrations/google-analytics/config";
export async function GET(request:Request){
  try{
    const ctx=await getActiveOrganisation();if(!ctx)return NextResponse.redirect(new URL("/app/onboarding",request.url));requireOrganisationAdmin(ctx.membership.role);
    const origin=new URL(request.url).origin,expected=new URL("/auth/google-analytics/callback",origin).toString(),configured=googleOAuthEnv().redirectUri;
    if(configured!==expected)return NextResponse.redirect(new URL(`/app/integrations?error=${encodeURIComponent(`Google redirect URI must be exactly ${expected}`)}`,origin));
    const state=createOAuthState(),verifier=createCodeVerifier(),store=await cookies(),secure=process.env.NODE_ENV==="production";
    store.set("ghost_ga4_state",state,{httpOnly:true,sameSite:"lax",secure,path:"/auth/google-analytics",maxAge:600});
    store.set("ghost_ga4_verifier",verifier,{httpOnly:true,sameSite:"lax",secure,path:"/auth/google-analytics",maxAge:600});
    return NextResponse.redirect(googleAuthorisationUrl(state,verifier));
  }catch(error){return NextResponse.redirect(new URL(`/app/integrations?error=${encodeURIComponent(error instanceof Error?error.message:"Google Analytics connection could not be started.")}`,request.url))}
}
