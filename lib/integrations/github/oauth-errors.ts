export type GitHubOAuthErrorKind = "provider_disabled"|"manual_linking_disabled"|"session_missing"|"redirect_invalid"|"already_linked"|"linked_elsewhere"|"url_missing"|"unexpected";
export type GitHubOAuthFailure = {kind:GitHubOAuthErrorKind;message:string;technicalMessage?:string};
type ErrorLike={message?:string;code?:string;status?:number}|null|undefined;
export function classifyGitHubOAuthError(error:ErrorLike,development=false):GitHubOAuthFailure {
  const technical=error?.message?.trim()||"Unknown Supabase Auth error";const lower=technical.toLowerCase();
  let kind:GitHubOAuthErrorKind="unexpected";let message="GitHub connection could not be started.";
  if(lower.includes("session")&&(lower.includes("missing")||lower.includes("not found"))){kind="session_missing";message="Your Ghost session is missing or expired. Sign in again, then reconnect GitHub."}
  else if(lower.includes("manual")&&lower.includes("link")){kind="manual_linking_disabled";message="Manual identity linking is disabled in Supabase Auth."}
  else if((lower.includes("provider")&&(lower.includes("disabled")||lower.includes("not enabled")))||lower.includes("unsupported provider")){kind="provider_disabled";message="The GitHub provider is disabled or incomplete in Supabase Auth."}
  else if(lower.includes("already linked")||lower.includes("identity is already linked")){kind="already_linked";message="This GitHub identity is already linked to your Ghost user."}
  else if(lower.includes("already exists")||lower.includes("another user")||lower.includes("different user")){kind="linked_elsewhere";message="This GitHub identity is linked to another Ghost user."}
  if(development)message=`${message} Supabase: ${technical}${error?.code?` [${error.code}]`:""}${error?.status?` (HTTP ${error.status})`:""}`;
  return {kind,message,technicalMessage:technical};
}
