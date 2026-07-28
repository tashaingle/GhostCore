import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {organisationApiContext} from "@/lib/organisations/api-context";
import {hasPermission,type OrganisationRole} from "@/lib/auth/permissions";
import {newStripeState,stateDigest,stripeAuthorisationUrl} from "@/lib/integrations/stripe/oauth";
import {STRIPE_OAUTH_COOKIE} from "@/lib/integrations/stripe/config";
export async function GET(request:Request){
  const ctx=await organisationApiContext();if(!ctx)return NextResponse.redirect(new URL("/login",request.url));
  if(!hasPermission(ctx.membership.role as OrganisationRole,"integration.manage"))return NextResponse.redirect(new URL("/app/integrations?error=Owner%20or%20admin%20access%20is%20required.",request.url));
  try{const state=newStripeState(),value=JSON.stringify({digest:stateDigest(state),organisationId:ctx.organisationId,issuedAt:Date.now()});(await cookies()).set(STRIPE_OAUTH_COOKIE,value,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:600});return NextResponse.redirect(stripeAuthorisationUrl(state))}
  catch(error){console.error("Stripe OAuth start failed",error instanceof Error?error.message:"unknown");return NextResponse.redirect(new URL("/app/integrations?error=Stripe%20connection%20could%20not%20be%20started.%20Check%20server%20configuration.",request.url))}
}
