import {describe,expect,it} from "vitest";
import {classifyGitHubOAuthError} from "@/lib/integrations/github/oauth-errors";
describe("GitHub OAuth errors",()=>{
  it("classifies the live provider-disabled error",()=>expect(classifyGitHubOAuthError({message:"Unsupported provider: provider is not enabled",code:"validation_failed",status:400})).toMatchObject({kind:"provider_disabled"}));
  it("classifies missing sessions and manual linking",()=>{expect(classifyGitHubOAuthError({message:"Auth session missing"}).kind).toBe("session_missing");expect(classifyGitHubOAuthError({message:"Manual linking is disabled"}).kind).toBe("manual_linking_disabled")});
  it("distinguishes linked identities",()=>{expect(classifyGitHubOAuthError({message:"Identity is already linked"}).kind).toBe("already_linked");expect(classifyGitHubOAuthError({message:"Identity already exists for another user"}).kind).toBe("linked_elsewhere")});
  it("includes technical detail only in development",()=>{const failure=classifyGitHubOAuthError({message:"Unsupported provider: provider is not enabled",code:"validation_failed",status:400},true);expect(failure.message).toContain("Supabase: Unsupported provider");expect(failure.message).toContain("HTTP 400")});
});
