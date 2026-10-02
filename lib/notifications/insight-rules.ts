import type {Json} from "@/types/database";
import type {
  NotificationCandidate,
  NotificationRuleContext,
  NotificationRuleDefinition,
} from "./types";

/** Insight rules about money: payments, sales, refunds and ad returns. */
const MONEY_RULE_PREFIXES = ["payments.", "commerce.", "advertising."];
const MONEY_RULES = ["cross_provider.ad_spend_up_orders_down"];

/**
 * Which insights need someone to act, rather than just being worth knowing: money-related
 * insights at warning or critical level. Informational and good-news insights stay as insights.
 */
export function insightNeedsAction(insight: {rule_id: string; severity: string}) {
  const money =
    MONEY_RULES.includes(insight.rule_id) ||
    MONEY_RULE_PREFIXES.some((prefix) => insight.rule_id.startsWith(prefix));
  return money && (insight.severity === "warning" || insight.severity === "critical");
}

/**
 * Turns urgent insights into Action Centre items, so they can be assigned, snoozed and tracked
 * (and emailed once email is on). An item resolves itself when its insight is resolved,
 * dismissed or stops appearing, because the engine resolves items a rule no longer reports.
 */
const insightRequiresAction: NotificationRuleDefinition = {
  key: "insight_requires_action",
  version: 1,
  name: "Insight needs action",
  description: "A money-related insight at warning or critical level needs someone to act.",
  category: "financial",
  defaultSeverity: "warning",
  async evaluate(c: NotificationRuleContext): Promise<NotificationCandidate[]> {
    const {data} = await c.client
      .from("insights")
      .select("id,title,summary,explanation,recommendation,severity,confidence,rule_id,updated_at")
      .eq("organisation_id", c.organisationId)
      .in("status", ["active", "acknowledged"])
      .order("updated_at", {ascending: false})
      .limit(c.limit);
    return (data ?? []).filter(insightNeedsAction).map((insight) => ({
      organisationId: c.organisationId,
      ruleKey: insightRequiresAction.key,
      ruleVersion: insightRequiresAction.version,
      category: insightRequiresAction.category,
      severity: insight.severity === "critical" ? "critical" : "warning",
      title: insight.title,
      summary: insight.summary,
      explanation: insight.explanation,
      recommendedAction: insight.recommendation,
      sourceType: "insight",
      sourceId: insight.id,
      condition: insight.rule_id,
      fingerprintParts: [
        c.organisationId,
        insightRequiresAction.key,
        String(insightRequiresAction.version),
        "insight",
        insight.id,
      ],
      evidence: [
        {
          evidenceType: "insight",
          sourceTable: "insights",
          sourceId: insight.id,
          label: "Insight",
          description: insight.summary,
          observed: {rule: insight.rule_id, confidence: insight.confidence} as Json,
          occurredAt: insight.updated_at,
        },
      ],
    }));
  },
};

export const insightNotificationRules = [insightRequiresAction];
