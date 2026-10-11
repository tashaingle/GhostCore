export type GitHubOAuthErrorKind =
  | "provider_disabled"
  | "manual_linking_disabled"
  | "session_missing"
  | "redirect_invalid"
  | "already_linked"
  | "linked_elsewhere"
  | "url_missing"
  | "unexpected";
export type GitHubOAuthFailure = {
  kind: GitHubOAuthErrorKind;
  message: string;
  technicalMessage?: string;
};
type ErrorLike = {message?: string; code?: string; status?: number} | null | undefined;
export function classifyGitHubOAuthError(
  error: ErrorLike,
  development = false,
): GitHubOAuthFailure {
  const technical = error?.message?.trim() || "Unknown Supabase Auth error";
  const lower = technical.toLowerCase();
  let kind: GitHubOAuthErrorKind = "unexpected";
  // Setup problems are ours to fix, so customers get a plain message; details stay in development.
  let message =
    "GitHub can't be connected right now. Please try again in a few minutes, or email support@metricmage.co.uk if it keeps happening.";
  if (lower.includes("session") && (lower.includes("missing") || lower.includes("not found"))) {
    kind = "session_missing";
    message =
      "Your Metric Mage session is missing or expired. Sign in again, then reconnect GitHub.";
  } else if (lower.includes("manual") && lower.includes("link")) {
    kind = "manual_linking_disabled";
    message = development
      ? "Manual identity linking is disabled in Supabase Auth."
      : "GitHub can't be connected right now. Please try again in a few minutes, or email support@metricmage.co.uk if it keeps happening.";
  } else if (
    (lower.includes("provider") && (lower.includes("disabled") || lower.includes("not enabled"))) ||
    lower.includes("unsupported provider")
  ) {
    kind = "provider_disabled";
    message = development
      ? "The GitHub provider is disabled or incomplete in Supabase Auth."
      : "GitHub can't be connected right now. Please try again in a few minutes, or email support@metricmage.co.uk if it keeps happening.";
  } else if (lower.includes("already linked") || lower.includes("identity is already linked")) {
    kind = "already_linked";
    message =
      "Your GitHub account is already linked, but Metric Mage has lost access to it. Email support@metricmage.co.uk and we'll reset it so you can connect again.";
  } else if (
    lower.includes("already exists") ||
    lower.includes("another user") ||
    lower.includes("different user")
  ) {
    kind = "linked_elsewhere";
    message =
      "This GitHub account is already connected to a different Metric Mage login. Sign in with that login, or disconnect GitHub there first.";
  }
  if (development)
    message = `${message} Supabase: ${technical}${error?.code ? ` [${error.code}]` : ""}${error?.status ? ` (HTTP ${error.status})` : ""}`;
  return {kind, message, technicalMessage: technical};
}
