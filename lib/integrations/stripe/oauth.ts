import "server-only";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {stripeClient} from "./client";
import {stripeEnvironment} from "./config";
export const newStripeState=()=>randomBytes(32).toString("base64url");
export const stateDigest=(state:string)=>createHash("sha256").update(state).digest("base64url");
export function stateMatches(expected:string|undefined,actual:string|null){if(!expected||!actual)return false;const a=Buffer.from(expected),b=Buffer.from(stateDigest(actual));return a.length===b.length&&timingSafeEqual(a,b)}
export function stripeAuthorisationUrl(state:string){
  const{clientId,redirectUri}=stripeEnvironment(),url=new URL("https://connect.stripe.com/oauth/authorize");
  // Stripe rejects scope=read_only unless Support enables it on the platform.
  // Ghost still only performs read API calls; read_write is the OAuth permission Stripe grants by default.
  url.search=new URLSearchParams({response_type:"code",scope:"read_write",client_id:clientId,redirect_uri:redirectUri,state}).toString();return url.toString();
}
export async function exchangeStripeCode(code:string){return stripeClient().oauth.token({grant_type:"authorization_code",code})}
