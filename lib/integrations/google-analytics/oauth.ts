import "server-only";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {GA4_SCOPES,googleOAuthEnv} from "./config";
export function createOAuthState(){return randomBytes(32).toString("base64url")}
export function createCodeVerifier(){return randomBytes(48).toString("base64url")}
export function codeChallenge(verifier:string){return createHash("sha256").update(verifier).digest("base64url")}
export function validateOAuthState(expected:string|undefined,received:string|null){if(!expected||!received)return false;const a=Buffer.from(expected),b=Buffer.from(received);return a.length===b.length&&timingSafeEqual(a,b)}
export function googleAuthorisationUrl(state:string,verifier:string){
  const {clientId,redirectUri}=googleOAuthEnv();const query=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:GA4_SCOPES.join(" "),access_type:"offline",prompt:"consent",include_granted_scopes:"false",state,code_challenge:codeChallenge(verifier),code_challenge_method:"S256"});
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}
export type GoogleTokens={access_token:string;refresh_token?:string;expires_in:number;token_type:string;scope?:string};
export async function exchangeGoogleCode(code:string,verifier:string,request:typeof fetch=fetch):Promise<GoogleTokens>{
  const env=googleOAuthEnv();const response=await request("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.clientId,client_secret:env.clientSecret,redirect_uri:env.redirectUri,grant_type:"authorization_code",code,code_verifier:verifier})});
  const body=await response.json() as GoogleTokens&{error?:string;error_description?:string};if(!response.ok||body.error)throw new Error(body.error_description||body.error||"Google authorization-code exchange failed.");if(!body.access_token)throw new Error("Google returned no access token.");return body;
}
