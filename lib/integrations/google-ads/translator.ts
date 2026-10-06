import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {CampaignDay} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {style: "currency", currency}).format(amount);
const count = (n: number, one: string, many: string) =>
  `${Math.round(n).toLocaleString("en-GB")} ${Math.round(n) === 1 ? one : many}`;

export type AccountDay = {
  customerId: string;
  name: string;
  currency: string;
  day: string;
  campaigns: CampaignDay[];
  /** True when spend jumped well above the account's other recent days. */
  spendJump?: boolean;
};

export function translateAdsDay(
  input: AccountDay,
  context: TranslationContext,
  revision: string,
  campaignLimit = 10,
): NormalisedEventInput | null {
  const name = clean(input.name, 80);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return null;
  const costMicros = input.campaigns.reduce((total, c) => total + c.costMicros, 0n),
    spend = Number(costMicros) / 1_000_000,
    impressions = input.campaigns.reduce((t, c) => t + c.impressions, 0),
    clicks = input.campaigns.reduce((t, c) => t + c.clicks, 0),
    conversions = input.campaigns.reduce((t, c) => t + c.conversions, 0),
    value = input.campaigns.reduce((t, c) => t + c.conversionsValue, 0),
    parts = [
      `${money(spend, input.currency)} spent`,
      count(clicks, "click", "clicks"),
      ...(conversions > 0 ? [count(conversions, "conversion", "conversions")] : []),
    ];
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "google_ads",
    category: "marketing",
    eventType: "google_ads.performance.daily_recorded",
    title: `Google Ads · ${name} · ${parts.join(", ")}`.slice(0, 200),
    description: input.spendJump
      ? "Spend was much higher than on the account's other recent days."
      : conversions > 0 && spend > 0
        ? `${money(spend / conversions, input.currency)} per conversion.`
        : null,
    severity: input.spendJump ? "warning" : "info",
    occurredAt: `${input.day}T12:00:00.000Z`,
    // Google keeps updating recent days, so each sync day records a new revision.
    externalId: `google_ads:${input.customerId}:${input.day}:${revision}`,
    rawPayload: {reportingDate: input.day, revision},
    metadata: {
      sourceAccountId: input.customerId,
      sourceEntityType: "account",
      sourceEntityName: name,
      reportingDate: input.day,
      currency: input.currency,
      metrics: {
        spend: Number(spend.toFixed(2)),
        spendMicros: costMicros.toString(),
        impressions,
        clicks,
        conversions: Number(conversions.toFixed(2)),
        conversionsValue: Number(value.toFixed(2)),
      },
      campaigns: [...input.campaigns]
        .sort((a, b) => (b.costMicros > a.costMicros ? 1 : b.costMicros < a.costMicros ? -1 : 0))
        .slice(0, campaignLimit)
        .map((c) => ({
          id: c.campaignId,
          name: clean(c.name, 80),
          spend: Number((Number(c.costMicros) / 1_000_000).toFixed(2)),
          clicks: c.clicks,
          conversions: Number(c.conversions.toFixed(2)),
        })),
      spendJump: Boolean(input.spendJump),
    },
  };
}
