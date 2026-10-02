import {INTELLIGENCE_CONFIG as C} from "../../config";
import type {IntelligenceEvent, IntelligenceRule} from "../../types";
import {comparisonWindows, contextNow, isoWeek, metadataString, within} from "../../windows";

const paymentId = (e: IntelligenceEvent) =>
  metadataString(e.metadata, "paymentId") ?? metadataString(e.metadata, "providerObjectId");

export const stripeFailureRateRule: IntelligenceRule = {
  id: "payments.stripe_failure_rate",
  name: "Stripe payment failures rising",
  description: "Flags when a high share of live Stripe payments fail and are not recovered.",
  priority: 35,
  supportedProviders: ["stripe"],
  evaluate(events, context) {
    const now = contextNow(context),
      {currentStart, end} = comparisonWindows(now, C.comparisonWindowDays),
      recent = events.filter(
        (e) =>
          (e.eventType === "stripe.payment_succeeded" || e.eventType === "stripe.payment_failed") &&
          e.metadata.mode === "live" &&
          within(e, currentStart, end),
      ),
      succeeded = new Set(
        recent.filter((e) => e.eventType === "stripe.payment_succeeded").map(paymentId),
      ),
      // A payment that failed and then succeeded on retry was recovered, so it is not counted.
      lost = new Map(
        recent
          .filter((e) => e.eventType === "stripe.payment_failed")
          .flatMap((e) => {
            const id = paymentId(e);
            return id && !succeeded.has(id) ? [[id, e] as const] : [];
          }),
      ),
      attempted = new Set([...succeeded, ...lost.keys()].filter(Boolean)),
      rate = attempted.size ? Math.round((lost.size / attempted.size) * 1000) / 10 : 0;
    if (lost.size < C.minimumPaymentFailures || rate < C.paymentFailureRatePercent) return [];
    return [
      {
        title: `${rate}% of Stripe payments failing`,
        summary: `${lost.size} of ${attempted.size} live payments in the last ${C.comparisonWindowDays} days failed and were not recovered.`,
        severity:
          rate >= C.paymentFailureCriticalPercent ? ("critical" as const) : ("warning" as const),
        confidence: Math.min(93, 70 + lost.size * 2),
        explanation: `${lost.size} payments failed without a later success, out of ${attempted.size} payments attempted (${rate}%).`,
        recommendation:
          "Review decline reasons in the Stripe dashboard, check for a broken checkout or 3D Secure step, and consider enabling Smart Retries for recurring payments.",
        sourceEventIds: [...lost.values()].slice(0, 50).map((e) => e.id),
        fingerprintKey: isoWeek(now),
        metadata: {
          failedPayments: lost.size,
          attemptedPayments: attempted.size,
          failureRatePercent: rate,
        },
      },
    ];
  },
};
