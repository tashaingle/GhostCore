export type OutlookAddress = {emailAddress?: {name?: string; address?: string}};
export type OutlookMessage = {
  id: string;
  conversationId?: string;
  subject?: string | null;
  from?: OutlookAddress | null;
  toRecipients?: OutlookAddress[];
  ccRecipients?: OutlookAddress[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  flag?: {flagStatus?: string};
};
/** Which folder a message was read from decides whether it was sent or received. */
export type OutlookRecord = {folder: "inbox" | "sentitems"; message: OutlookMessage};
export type OutlookProfile = {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
};
export type OutlookSettings = {
  mailboxEmail?: string;
  mailboxDomain?: string | null;
  initialSyncComplete?: boolean;
  initialWindowDays?: number;
  /** Newest message time seen per folder, so each sync only asks for what's new. */
  inboxCursor?: string;
  sentCursor?: string;
  includeReceived?: boolean;
  includeSent?: boolean;
  includeUnread?: boolean;
  includeAttachments?: boolean;
  grantedScopes?: string;
};
