import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceEvent, IntelligenceRule} from "../../types";
import {contextNow, groupBy, metadataString, occurredMs} from "../../windows";

const DAY_MS = 86_400_000;
const NEEDS_RESPONSE = new Set(["needs_response", "warning_needs_response"]);

const recentLive = (events: IntelligenceEvent[], types: string[], now: Date) =>
  events.filter(
    (e) =>
      types.includes(e.eventType) &&
      e.metadata.mode === "live" &&
      occurredMs(e) >= now.getTime() - C.moneyAtRiskWindowDays * DAY_MS,
  );

const amount = (e: IntelligenceEvent) => {
  const display = metadataString(e.metadata, "displayAmount"),
    currency = metadataString(e.metadata, "currency");
  return display ? `${display}${currency ? ` ${currency.toUpperCase()}` : ""}` : "an amount";
};

export const stripeDisputeRule: IntelligenceRule = {
  id: "payments.stripe_dispute_needs_response",
  name: "Stripe dispute needs a response",
  description: "Flags each live Stripe dispute while it is still waiting for your response.",
  priority: 10,
  supportedProviders: ["stripe"],
  evaluate(events, context) {
    const now = contextNow(context),
      disputes = recentLive(events, ["stripe.dispute_opened", "stripe.dispute_updated"], now);
    return [...groupBy(disputes, (e) => metadataString(e.metadata, "providerObjectId"))].flatMap(
      ([disputeId, history]) => {
        const latest = history.reduce((a, b) => (occurredMs(b) > occurredMs(a) ? b : a)),
          status = metadataString(latest.metadata, "status");
        if (!status || !NEEDS_RESPONSE.has(status)) return [];
        return [
          {
            title: `Stripe dispute needs a response (${amount(latest)})`,
            summary:
              "A customer disputed a payment. Unanswered disputes are lost automatically when the evidence deadline passes.",
            severity: "critical" as const,
            confidence: 97,
            explanation: `Dispute ${disputeId} was opened and its latest status is "${status}".`,
            recommendation:
              "Open the dispute in the Stripe dashboard and submit evidence such as receipts, delivery confirmation and customer communication before the deadline shown there.",
            sourceEventIds: history.map((e) => e.id),
            fingerprintKey: disputeId,
            metadata: {disputeId, status},
          },
        ];
      },
    );
  },
};

export const stripePayoutFailedRule: IntelligenceRule = {
  id: "payments.stripe_payout_failed",
  name: "Stripe payout failed",
  description: "Flags each failed live Stripe payout to your bank account.",
  priority: 12,
  supportedProviders: ["stripe"],
  evaluate(events, context) {
    return recentLive(events, ["stripe.payout_failed"], contextNow(context)).flatMap((e) => {
      const payoutId = metadataString(e.metadata, "providerObjectId");
      if (!payoutId) return [];
      return [
        {
          title: `Stripe payout failed (${amount(e)})`,
          summary:
            "Stripe could not send money to your bank account. Further payouts may be paused until this is fixed.",
          severity: "critical" as const,
          confidence: 97,
          explanation: `Payout ${payoutId} failed on ${e.occurredAt.slice(0, 10)}.`,
          recommendation:
            "Check the bank account details in Stripe under Settings → Payouts, and contact your bank if the details are correct.",
          sourceEventIds: [e.id],
          fingerprintKey: payoutId,
          metadata: {payoutId},
        },
      ];
    });
  },
};
