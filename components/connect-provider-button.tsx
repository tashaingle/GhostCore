"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {getSupabaseEnv} from "@/lib/supabase/env";
import {
  classifyGitHubOAuthError,
  type GitHubOAuthFailure,
} from "@/lib/integrations/github/oauth-errors";
type Props = {
  providerId: string;
  displayName: string;
  oauthProvider: string;
  oauthScopes: string;
  callbackPath: string;
  configuredSiteUrl: string;
};
const development = process.env.NODE_ENV === "development";
export function ConnectProviderButton(props: Props) {
  const [failure, setFailure] = useState<GitHubOAuthFailure | null>(null);
  const [pending, setPending] = useState(false);
  async function connect() {
    setPending(true);
    setFailure(null);
    try {
      const expected = new URL(props.callbackPath, props.configuredSiteUrl).toString();
      const actual = new URL(props.callbackPath, window.location.origin).toString();
      if (!["http:", "https:"].includes(new URL(expected).protocol) || expected !== actual) {
        setFailure({
          kind: "redirect_invalid",
          message: `Invalid ${props.displayName} redirect URL. Expected ${actual}, but NEXT_PUBLIC_SITE_URL produces ${expected}.`,
        });
        return;
      }
      const {url, key} = getSupabaseEnv();
      try {
        const response = await fetch(`${url}/auth/v1/settings`, {headers: {apikey: key}});
        if (response.ok) {
          const settings = (await response.json()) as {external?: Record<string, boolean>};
          if (settings.external?.[props.oauthProvider] !== true) {
            setFailure({
              kind: "provider_disabled",
              message: `${props.displayName} is disabled in the active Supabase project.`,
            });
            return;
          }
        }
      } catch {}
      const supabase = createClient();
      const {
        data: {user},
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setFailure(
          classifyGitHubOAuthError(userError ?? {message: "Auth session missing"}, development),
        );
        return;
      }
      const {data: identities, error: identitiesError} = await supabase.auth.getUserIdentities();
      if (identitiesError) {
        setFailure(classifyGitHubOAuthError(identitiesError, development));
        return;
      }
      // The provider can only be linked to a Ghost login once, and its token is only issued while
      // linking. Each organisation stores its own copy of the token, so to connect another
      // organisation the existing link is removed and created again. Earlier organisations keep
      // working with their stored tokens.
      const existing = identities.identities.find(
        (identity) => identity.provider === props.oauthProvider,
      );
      if (existing) {
        if (identities.identities.length < 2) {
          setFailure({
            kind: "already_linked",
            message: `${props.displayName} is how you sign in to Ghost, so it can't be re-linked here. Add an email sign-in to your account first, then try again.`,
          });
          return;
        }
        const {error: unlinkError} = await supabase.auth.unlinkIdentity(existing);
        if (unlinkError) {
          setFailure({
            kind: "already_linked",
            message: `${props.displayName} is already linked to your Ghost login and couldn't be refreshed. Please try again.`,
          });
          return;
        }
      }
      const {data, error} = await supabase.auth.linkIdentity({
        provider: props.oauthProvider as "github",
        options: {redirectTo: actual, scopes: props.oauthScopes, skipBrowserRedirect: true},
      });
      if (error) {
        if (development)
          console.error("Supabase provider link failed", {
            provider: props.providerId,
            message: error.message,
            code: error.code,
            status: error.status,
          });
        setFailure(classifyGitHubOAuthError(error, development));
        return;
      }
      if (!data.url) {
        setFailure({
          kind: "url_missing",
          message: `Supabase did not return a ${props.displayName} authorization URL.`,
        });
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setFailure(
        classifyGitHubOAuthError(
          error instanceof Error ? {message: error.message} : {message: "Unexpected OAuth error"},
          development,
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="button" onClick={connect} disabled={pending}>
        {pending ? "Connecting…" : `Connect ${props.displayName}`}
      </button>
      {failure && (
        <p className="error" role="alert">
          {failure.message}
        </p>
      )}
    </div>
  );
}
