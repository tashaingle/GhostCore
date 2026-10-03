import type {NormalisedEventInput} from "@/types/events";
import type {TranslationContext} from "../connector";
import type {MailchimpRecord} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** Campaign reports give fractions; store percentages like audience stats do. */
const percent = (fraction: unknown) => Math.round(n(fraction) * 1000) / 10;
const pretty = (v: number) => v.toLocaleString("en-GB");

export function translateMailchimp(
  record: MailchimpRecord,
  context: TranslationContext,
): NormalisedEventInput | null {
  const base = {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "mailchimp",
    category: "marketing" as const,
    severity: "info" as const,
  };

  if (record.kind === "audience") {
    const {audience, day} = record,
      s = audience.stats ?? {},
      name = clean(audience.name || "Audience", 150);
    return {
      ...base,
      eventType: "mailchimp.audience.daily_recorded",
      title: `${name}: ${pretty(n(s.member_count))} subscribers`,
      description: `Average open rate ${n(s.open_rate).toFixed(1)}%, click rate ${n(s.click_rate).toFixed(1)}%.`,
      occurredAt: `${day}T23:59:59.000Z`,
      externalId: `mailchimp:${context.integrationId}:audience:${audience.id}:${day}`,
      metadata: {
        audienceId: audience.id,
        audienceName: name,
        subscribers: n(s.member_count),
        unsubscribed: n(s.unsubscribe_count),
        cleaned: n(s.cleaned_count),
        newSinceLastCampaign: n(s.member_count_since_send),
        openRate: n(s.open_rate),
        clickRate: n(s.click_rate),
        campaignCount: n(s.campaign_count),
        lastSubscribedAt: s.last_sub_date || null,
      },
      rawPayload: {audienceId: audience.id},
    };
  }

  const c = record.campaign;
  if (!c.send_time) return null;
  const subject = clean(c.settings?.subject_line || c.settings?.title || "Campaign", 300),
    audience = clean(c.recipients?.list_name || "your audience", 150),
    r = c.report_summary ?? {},
    openRate = percent(r.open_rate),
    clickRate = percent(r.click_rate),
    metadata = {
      campaignId: c.id,
      subject,
      audienceId: c.recipients?.list_id ?? null,
      audienceName: audience,
      emailsSent: n(c.emails_sent),
      uniqueOpens: n(r.unique_opens),
      openRate,
      clicks: n(r.clicks),
      subscriberClicks: n(r.subscriber_clicks),
      clickRate,
    };

  if (record.kind === "sent")
    return {
      ...base,
      eventType: "mailchimp.campaign.sent",
      title: `Email campaign sent: ${subject}`,
      description: `Sent to ${pretty(n(c.emails_sent))} people in ${audience}.`,
      occurredAt: new Date(c.send_time).toISOString(),
      externalId: `mailchimp:${context.integrationId}:campaign:${c.id}:sent`,
      metadata,
      rawPayload: {campaignId: c.id},
    };

  // Opens and clicks keep arriving for a few days, so results are recorded once they've settled.
  return {
    ...base,
    eventType: "mailchimp.campaign.results_recorded",
    title: `Campaign results: ${subject}`,
    description: `${openRate}% opened and ${clickRate}% clicked, out of ${pretty(n(c.emails_sent))} sent.`,
    occurredAt: new Date(new Date(c.send_time).getTime() + 3 * 86_400_000).toISOString(),
    externalId: `mailchimp:${context.integrationId}:campaign:${c.id}:results`,
    metadata,
    rawPayload: {campaignId: c.id},
  };
}
