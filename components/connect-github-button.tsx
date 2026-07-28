"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {getSupabaseEnv} from "@/lib/supabase/env";
import {classifyGitHubOAuthError,type GitHubOAuthFailure} from "@/lib/integrations/github/oauth-errors";
const development=process.env.NODE_ENV==="development";
export function ConnectGitHubButton({configuredSiteUrl}:{configuredSiteUrl:string}){
  const [failure,setFailure]=useState<GitHubOAuthFailure|null>(null);const [pending,setPending]=useState(false);
  async function connect(){
    setPending(true);setFailure(null);
    try{
      const expected=new URL("/auth/github/callback",configuredSiteUrl).toString();const actual=new URL("/auth/github/callback",window.location.origin).toString();
      if(!["http:","https:"].includes(new URL(expected).protocol)||expected!==actual){setFailure({kind:"redirect_invalid",message:`Invalid GitHub redirect URL. Expected ${actual}, but NEXT_PUBLIC_SITE_URL produces ${expected}.`});return}
      const {url,key}=getSupabaseEnv();
      try{
        const response=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:key}});
        if(response.ok){const settings=await response.json() as {external?:{github?:boolean}};if(settings.external?.github!==true){setFailure({kind:"provider_disabled",message:"GitHub is disabled in the active Supabase project. In Authentication → Providers → GitHub, turn GitHub Enabled on and save again."});return}}
      }catch{/* Let linkIdentity return the authoritative error when settings cannot be checked. */}
      const supabase=createClient();const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user){setFailure(classifyGitHubOAuthError(userError??{message:"Auth session missing"},development));return}
      const {data:identities,error:identitiesError}=await supabase.auth.getUserIdentities();
      if(identitiesError){setFailure(classifyGitHubOAuthError(identitiesError,development));return}
      if(identities.identities.some(identity=>identity.provider==="github")){setFailure({kind:"already_linked",message:"GitHub is already linked to this Ghost user, but no usable integration token exists. Remove the linked GitHub identity in Supabase Auth, then connect again."});return}
      const {data,error}=await supabase.auth.linkIdentity({provider:"github",options:{redirectTo:actual,scopes:"read:user repo",skipBrowserRedirect:true}});
      if(error){if(development)console.error("Supabase GitHub linkIdentity failed",{message:error.message,code:error.code,status:error.status});setFailure(classifyGitHubOAuthError(error,development));return}
      if(!data.url){setFailure({kind:"url_missing",message:development?"Supabase returned no GitHub OAuth URL and no Auth error.":"Supabase did not return a GitHub authorization URL."});return}
      window.location.assign(data.url);
    }catch(error){const authError=error instanceof Error?{message:error.message}:{message:"Unexpected GitHub OAuth error"};if(development)console.error("Unexpected GitHub connection error",authError);setFailure(classifyGitHubOAuthError(authError,development))}
    finally{setPending(false)}
  }
  return <div className="space-y-2"><button type="button" className="button" onClick={connect} disabled={pending}>{pending?"Connecting…":"Connect GitHub"}</button>{failure&&<p className="error" role="alert" data-error-kind={failure.kind}>{failure.message}</p>}</div>;
}
