import {highlights, performanceMetrics} from "@/lib/home/performance";
import {explainDrop, whyContext} from "@/lib/home/why";
import type {InsightCandidate, IntelligenceRule} from "../../types";
import {contextNow, isoWeek} from "../../windows";

/**
 * A figure that fell this week, joined up with what changed in the other tools at the same time
 * (the same reasoning as "Why" on Home). Only reported when there is a likely reason: a drop with
 * no explanation is already on Home and in the Monday email.
 */
function dropExplainedRule(rule: {
  id: string;
  name: string;
  description: string;
  priority: number;
  metrics: string[];
}): IntelligenceRule {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    priority: rule.priority,
    supportedProviders: [
      "shopify",
      "stripe",
      "google_analytics",
      "google_search_console",
      "meta_ads",
      "google_ads",
      "vercel",
      "mailchimp",
    ],
    evaluate(events, context) {
      const now = contextNow(context),
        metrics = performanceMetrics({events, counts: {}, period: "week", now}),
        byKey = new Map(metrics.map((m) => [m.key, m])),
        ctx = whyContext({metrics, events, period: "week", now});
      return highlights(metrics, "week").flatMap((h): InsightCandidate[] => {
        const metric = h.key ? byKey.get(h.key) : undefined;
        if (h.tone !== "bad" || !metric || !rule.metrics.includes(metric.key)) return [];
        const why = explainDrop(metric.key, ctx),
          lead = why?.likely[0];
        if (!why || !lead) return [];
        const drop = Math.abs(Math.round(metric.change ?? 0)),
          two = why.likely.length > 1;
        return [
          {
            title: two
              ? `${metric.label} down ${drop}%, with two likely reasons`
              : `${metric.label} down ${drop}%, most likely ${lead.name}`,
            summary: why.text,
            severity: drop >= 50 && lead.weight >= 75 ? "critical" : "warning",
            // Lower when two things changed at once and either could be the reason.
            confidence: two ? Math.min(60, lead.weight) : Math.min(85, lead.weight),
            explanation: `${h.text}. Metric Mage compared your other connected tools over the same week. This shows what changed at the same time, not proof of what caused it.`,
            recommendation: lead.advice ?? "Check what changed in the tool named above.",
            sourceEventIds: [...why.likely, ...why.possible]
              .flatMap((c) => c.eventIds ?? [])
              .slice(0, 50),
            fingerprintKey: `${metric.key}:${isoWeek(now)}`,
            metadata: {
              metric: metric.key,
              changePercent: metric.change,
              likely: why.likely.map((c) => c.name),
              alsoChanged: why.possible.map((c) => c.name),
              normal: why.normal.map((c) => c.name),
              action: lead.action ?? null,
            },
          },
        ];
      });
    },
  };
}

/** Sales and conversions: money, so these also go to the Action Centre. */
export const salesDropExplainedRule = dropExplainedRule({
  id: "commerce.drop_explained",
  name: "Sales fell, with a likely reason",
  description:
    "Revenue, orders or conversions fell and another tool changed at the same time, such as ads stopping or payments failing.",
  priority: 33,
  metrics: ["revenue", "orders", "conversions"],
});

/** Visitors and Google search clicks: worth knowing, kept as insights. */
export const trafficDropExplainedRule = dropExplainedRule({
  id: "cross_provider.traffic_drop_explained",
  name: "Visitors fell, with a likely reason",
  description:
    "Website visits or Google search clicks fell and another tool changed at the same time, such as ads stopping or pages dropping in Google.",
  priority: 34,
  metrics: ["visits", "searchClicks"],
});
