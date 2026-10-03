export type MailchimpAudienceStats = {
  member_count?: number;
  unsubscribe_count?: number;
  cleaned_count?: number;
  member_count_since_send?: number;
  campaign_count?: number;
  campaign_last_sent?: string;
  /** Percentages (e.g. 42.5), unlike campaign reports. */
  open_rate?: number;
  click_rate?: number;
  last_sub_date?: string;
  last_unsub_date?: string;
};
export type MailchimpAudience = {id: string; name: string; stats?: MailchimpAudienceStats};
export type MailchimpCampaign = {
  id: string;
  send_time?: string;
  emails_sent?: number;
  settings?: {subject_line?: string; title?: string};
  recipients?: {list_id?: string; list_name?: string};
  /** Rates here are fractions (0.425), unlike audience stats. */
  report_summary?: {
    opens?: number;
    unique_opens?: number;
    open_rate?: number;
    clicks?: number;
    subscriber_clicks?: number;
    click_rate?: number;
  };
};
export type MailchimpRecord =
  | {kind: "audience"; day: string; audience: MailchimpAudience}
  | {kind: "sent" | "results"; campaign: MailchimpCampaign};
export type MailchimpSettings = {
  dc?: string;
  apiEndpoint?: string;
  accountName?: string;
  audiences?: {id: string; name: string; selected?: boolean}[];
  campaignCursor?: string;
  initialSyncComplete?: boolean;
};
