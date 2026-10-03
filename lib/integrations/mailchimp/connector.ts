import type {IntegrationConnector, IntegrationSyncContext, TranslationContext} from "../connector";
import {MailchimpClient} from "./client";
import {MailchimpError} from "./errors";
import {translateMailchimp} from "./translator";
import type {MailchimpRecord, MailchimpSettings} from "./types";

const DAY = 86_400_000;
/** Results are recorded once a campaign is this many days old, when opens have mostly settled. */
export const RESULTS_AFTER_DAYS = 3;
const FIRST_SYNC_DAYS = 90;

export class MailchimpConnector implements IntegrationConnector<MailchimpRecord> {
  readonly provider = "mailchimp";
  private error?: unknown;
  constructor(
    private client: MailchimpClient,
    private settings: MailchimpSettings,
  ) {}
  connect = async () => ({ok: true});
  // Mailchimp has no revoke endpoint; disconnecting deletes the stored token, and the person can
  // also remove Metric Mage under Profile → Connected sites in Mailchimp.
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.audiences();
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof MailchimpError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: MailchimpRecord, context: TranslationContext) {
    return translateMailchimp(record, context);
  }

  /** Everything except audiences the person unticked; new audiences are included until they do. */
  private wanted(id: string | undefined) {
    return !(this.settings.audiences ?? []).some((a) => a.id === id && a.selected === false);
  }

  async sync(context: IntegrationSyncContext, now = new Date()) {
    const receivedAt = context.receivedAt ?? now.toISOString(),
      day = now.toISOString().slice(0, 10),
      since =
        this.settings.campaignCursor ??
        new Date(now.getTime() - FIRST_SYNC_DAYS * DAY).toISOString(),
      settledBefore = new Date(now.getTime() - RESULTS_AFTER_DAYS * DAY).toISOString(),
      settledSince = new Date(now.getTime() - (RESULTS_AFTER_DAYS + 30) * DAY).toISOString();

    const [audiences, sent, settled] = await Promise.all([
      this.client.audiences(),
      this.client.sentCampaigns(since),
      this.client.sentCampaigns(settledSince, settledBefore),
    ]);
    const records: MailchimpRecord[] = [
      ...audiences
        .filter((a) => this.wanted(a.id))
        .map((audience) => ({kind: "audience" as const, day, audience})),
      ...sent
        .filter((c) => this.wanted(c.recipients?.list_id))
        .map((campaign) => ({kind: "sent" as const, campaign})),
      ...settled
        .filter((c) => this.wanted(c.recipients?.list_id))
        .map((campaign) => ({kind: "results" as const, campaign})),
    ];
    const events = records.flatMap((record) => {
      const event = translateMailchimp(record, {...context, receivedAt});
      return event ? [event] : [];
    });
    const newest = sent
      .map((c) => c.send_time ?? "")
      .filter(Boolean)
      .sort()
      .at(-1);

    // Keep the audience list current so new audiences appear in settings (ticked by default).
    const known = new Map((this.settings.audiences ?? []).map((a) => [a.id, a]));
    const settings: MailchimpSettings & Record<string, unknown> = {
      ...this.settings,
      audiences: audiences.map((a) => ({
        id: a.id,
        name: a.name,
        selected: known.get(a.id)?.selected ?? true,
      })),
      campaignCursor: newest ?? this.settings.campaignCursor ?? since,
      initialSyncComplete: true,
    };
    return {received: records.length, events, settings, filtered: records.length - events.length};
  }
}
