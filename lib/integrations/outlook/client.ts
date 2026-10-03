import "server-only";
import type {ConnectorCredentialUpdate} from "../connector";
import {OutlookError} from "./errors";
import {refreshOutlookToken} from "./oauth";
import type {OutlookMessage, OutlookProfile, OutlookRecord, OutlookSettings} from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
// Only what Mail.ReadBasic allows: no body, preview or attachment contents.
const FIELDS = [
  "id",
  "conversationId",
  "subject",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "sentDateTime",
  "isRead",
  "hasAttachments",
  "importance",
  "flag",
].join(",");
const PAGES_PER_FOLDER = 5;
const PAGE_SIZE = 50;

type Credentials = {accessToken: string; refreshToken?: string; expiresAt?: string};

/** Microsoft's own explanation from an error response, kept short for display. */
async function graphReason(response: Response) {
  try {
    const body = (await response.json()) as {error?: {code?: string; message?: string}};
    return [body.error?.code, body.error?.message].filter(Boolean).join(": ").slice(0, 180);
  } catch {
    return "";
  }
}

export class OutlookClient {
  private access: string;
  private refreshToken?: string;
  private expiry?: string;
  private updated?: ConnectorCredentialUpdate;
  constructor(
    credentials: Credentials,
    private request: typeof fetch = fetch,
  ) {
    this.access = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.expiry = credentials.expiresAt;
  }
  credentialUpdate() {
    return this.updated;
  }

  private async token() {
    if (!this.expiry || new Date(this.expiry).getTime() > Date.now() + 60_000) return this.access;
    if (!this.refreshToken)
      throw new OutlookError("unauthorized", "Outlook needs reconnecting. Connect it again.");
    let result: Awaited<ReturnType<typeof refreshOutlookToken>>;
    try {
      result = await refreshOutlookToken(this.refreshToken, this.request);
    } catch {
      throw new OutlookError("network", "Microsoft couldn't be reached. Try again shortly.");
    }
    if (!result.ok || !result.body.access_token)
      throw new OutlookError(
        "unauthorized",
        "Outlook's sign-in has expired or was removed. Connect Outlook again.",
      );
    this.access = result.body.access_token;
    // Microsoft rotates refresh tokens: keep the new one if it sent one.
    this.refreshToken = result.body.refresh_token ?? this.refreshToken;
    this.expiry = new Date(Date.now() + (result.body.expires_in ?? 3600) * 1000).toISOString();
    this.updated = {
      accessToken: this.access,
      refreshToken: this.refreshToken,
      expiresAt: this.expiry,
    };
    return this.access;
  }

  private async get<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `Bearer ${await this.token()}`},
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof OutlookError) throw error;
      throw new OutlookError("network", "Microsoft couldn't be reached. Try again shortly.");
    }
    if (!response.ok) {
      const reason = await graphReason(response);
      if (/MailboxNotEnabledForRESTAPI|MailboxNotSupported/i.test(reason))
        throw new OutlookError(
          "provider",
          "This Microsoft account doesn't have an Outlook mailbox Metric Mage can read. Choose an Outlook, Hotmail or Microsoft 365 mailbox.",
        );
      if (response.status === 401)
        throw new OutlookError(
          "unauthorized",
          "Outlook's sign-in has expired or was removed. Connect Outlook again.",
        );
      if (response.status === 403)
        throw new OutlookError(
          "scope",
          "Permission to read this mailbox is missing. Connect Outlook again and accept.",
        );
      if (response.status === 429)
        throw new OutlookError(
          "rate_limit",
          "Microsoft asked Metric Mage to slow down. Try later.",
        );
      throw new OutlookError(
        "provider",
        `Outlook couldn't be read (${response.status}${reason ? `: ${reason}` : ""}).`,
      );
    }
    return (await response.json()) as T;
  }

  profile() {
    return this.get<OutlookProfile>(`${GRAPH}/me?$select=id,displayName,mail,userPrincipalName`);
  }

  /** Messages in one folder newer than `since`, newest first, within the page limits. */
  private async folder(folder: OutlookRecord["folder"], since: string) {
    const field = folder === "inbox" ? "receivedDateTime" : "sentDateTime";
    // Encoded by hand: Graph's OData filters need %20 for spaces, not the "+" URLSearchParams uses.
    const query = [
      ["$select", FIELDS],
      ["$filter", `${field} ge ${since}`],
      ["$orderby", `${field} desc`],
      ["$top", String(PAGE_SIZE)],
    ]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const messages: OutlookMessage[] = [];
    let next: string | undefined = `${GRAPH}/me/mailFolders/${folder}/messages?${query}`,
      pages = 0;
    while (next && pages < PAGES_PER_FOLDER) {
      const data: {value?: OutlookMessage[]; "@odata.nextLink"?: string} = await this.get(next);
      messages.push(...(data.value ?? []));
      next = data["@odata.nextLink"];
      pages++;
    }
    return {messages, pages};
  }

  async collect(settings: OutlookSettings, now = new Date()) {
    const windowStart = new Date(
      now.getTime() - (settings.initialWindowDays ?? 7) * 86_400_000,
    ).toISOString();
    const records: OutlookRecord[] = [];
    let pages = 0,
      inboxCursor = settings.inboxCursor,
      sentCursor = settings.sentCursor;
    if (settings.includeReceived !== false) {
      const inbox = await this.folder("inbox", settings.inboxCursor ?? windowStart);
      records.push(...inbox.messages.map((message) => ({folder: "inbox" as const, message})));
      pages += inbox.pages;
      inboxCursor = newest(inbox.messages, "receivedDateTime") ?? inboxCursor;
    }
    if (settings.includeSent !== false) {
      const sent = await this.folder("sentitems", settings.sentCursor ?? windowStart);
      records.push(...sent.messages.map((message) => ({folder: "sentitems" as const, message})));
      pages += sent.pages;
      sentCursor = newest(sent.messages, "sentDateTime") ?? sentCursor;
    }
    return {records, pages, inboxCursor, sentCursor, initial: !settings.initialSyncComplete};
  }
}

function newest(messages: OutlookMessage[], field: "receivedDateTime" | "sentDateTime") {
  return messages
    .map((m) => m[field])
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
}
