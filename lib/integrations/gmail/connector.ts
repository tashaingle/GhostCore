import type {IntegrationConnector, IntegrationSyncContext, TranslationContext} from "../connector";
import {GmailClient} from "./client";
import {GmailError} from "./errors";
import {translateGmail} from "./translator";
import type {GmailMessage, GmailSettings} from "./types";
export class GmailConnector implements IntegrationConnector<GmailMessage> {
  readonly provider = "gmail";
  private error?: unknown;
  constructor(
    private client: GmailClient,
    private settings: GmailSettings,
  ) {}
  connect = async () => ({ok: true});
  // Google grants one permission per Google account, shared by every Metric Mage connection that
  // uses it (Gmail, Calendar, Analytics, Search Console, in any organisation). Revoking it on
  // disconnect would cut off all of them, so disconnecting only deletes this connection's stored
  // sign-in. People can remove Metric Mage entirely from their Google Account's security settings.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.profile();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof GmailError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: GmailMessage, context: TranslationContext) {
    return translateGmail(record, context, String(this.settings.mailboxEmail ?? ""), this.settings);
  }
  async sync(context: IntegrationSyncContext) {
    const result = await this.client.collect(this.settings),
      receivedAt = context.receivedAt ?? new Date().toISOString(),
      profile = await this.client.profile(),
      settings = {
        ...this.settings,
        mailboxEmail: profile.emailAddress,
        historyId: result.historyId,
        initialSyncComplete: true,
        lastSyncMode: result.initial ? "initial" : result.fallback ? "fallback" : "incremental",
        pagesRequested: result.pages,
        translationFailures: result.failed,
      };
    const events = result.messages.flatMap((message) => {
      const translated = translateGmail(
        message,
        {...context, receivedAt},
        profile.emailAddress,
        settings,
      );
      return translated ? [translated] : [];
    });
    return {
      received: result.messages.length + result.failed,
      events,
      credentials: this.client.credentialUpdate(),
      settings,
      pages: result.pages,
      filtered: result.messages.length - events.length,
    };
  }
}
