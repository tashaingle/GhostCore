import "server-only";
import {MailchimpError} from "./errors";
import type {MailchimpAudience, MailchimpCampaign} from "./types";

const AUDIENCE_FIELDS = "lists.id,lists.name,lists.stats,total_items";
const CAMPAIGN_FIELDS = [
  "campaigns.id",
  "campaigns.send_time",
  "campaigns.emails_sent",
  "campaigns.settings.subject_line",
  "campaigns.settings.title",
  "campaigns.recipients.list_id",
  "campaigns.recipients.list_name",
  "campaigns.report_summary",
  "total_items",
].join(",");

/** Read-only calls to one Mailchimp account's data centre (e.g. https://us21.api.mailchimp.com). */
export class MailchimpClient {
  constructor(
    private token: string,
    private apiEndpoint: string,
    private request: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${this.apiEndpoint.replace(/\/+$/, "")}/3.0${path}?${new URLSearchParams(params)}`;
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `OAuth ${this.token}`},
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new MailchimpError("network", "Mailchimp couldn't be reached. Try again shortly.");
    }
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => ({}))) as {title?: string; detail?: string};
    if (response.status === 401 || response.status === 403)
      throw new MailchimpError(
        "unauthorized",
        "Mailchimp access was removed or has stopped working. Connect Mailchimp again.",
      );
    if (response.status === 429)
      throw new MailchimpError(
        "rate_limit",
        "Mailchimp asked Metric Mage to slow down. Try later.",
      );
    throw new MailchimpError(
      "provider",
      `Mailchimp couldn't be read (${response.status}${body.detail ? `: ${body.detail.slice(0, 160)}` : ""}).`,
    );
  }

  async audiences() {
    const data = await this.get<{lists?: MailchimpAudience[]}>("/lists", {
      count: "100",
      fields: AUDIENCE_FIELDS,
    });
    return data.lists ?? [];
  }

  /** Sent campaigns in a window, oldest first, with their report summary. */
  async sentCampaigns(since: string, before?: string) {
    const params: Record<string, string> = {
      status: "sent",
      since_send_time: since,
      sort_field: "send_time",
      sort_dir: "ASC",
      count: "200",
      fields: CAMPAIGN_FIELDS,
    };
    if (before) params.before_send_time = before;
    const data = await this.get<{campaigns?: MailchimpCampaign[]}>("/campaigns", params);
    return data.campaigns ?? [];
  }
}
