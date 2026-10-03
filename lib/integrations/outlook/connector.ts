import type {IntegrationConnector, IntegrationSyncContext, TranslationContext} from "../connector";
import {OutlookClient} from "./client";
import {OutlookError} from "./errors";
import {translateOutlook} from "./translator";
import type {OutlookRecord, OutlookSettings} from "./types";

export const mailboxAddress = (profile: {
  mail?: string | null;
  userPrincipalName?: string | null;
}) => (profile.mail || profile.userPrincipalName || "").toLowerCase();

export class OutlookConnector implements IntegrationConnector<OutlookRecord> {
  readonly provider = "outlook";
  private error?: unknown;
  constructor(
    private client: OutlookClient,
    private settings: OutlookSettings,
  ) {}
  connect = async () => ({ok: true});
  // Microsoft has no per-app token revoke; disconnecting deletes the stored sign-in instead.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.profile();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof OutlookError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: OutlookRecord, context: TranslationContext) {
    return translateOutlook(
      record,
      context,
      String(this.settings.mailboxEmail ?? ""),
      this.settings,
    );
  }
  async sync(context: IntegrationSyncContext) {
    const result = await this.client.collect(this.settings),
      receivedAt = context.receivedAt ?? new Date().toISOString(),
      mailbox = this.settings.mailboxEmail || mailboxAddress(await this.client.profile()),
      settings: OutlookSettings & Record<string, unknown> = {
        ...this.settings,
        mailboxEmail: mailbox,
        inboxCursor: result.inboxCursor,
        sentCursor: result.sentCursor,
        initialSyncComplete: true,
        lastSyncMode: result.initial ? "initial" : "incremental",
        pagesRequested: result.pages,
      };
    const events = result.records.flatMap((record) => {
      const translated = translateOutlook(record, {...context, receivedAt}, mailbox, settings);
      return translated ? [translated] : [];
    });
    return {
      received: result.records.length,
      events,
      credentials: this.client.credentialUpdate(),
      settings,
      pages: result.pages,
      filtered: result.records.length - events.length,
    };
  }
}
