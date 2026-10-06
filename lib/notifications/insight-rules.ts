import type {Json} from "@/types/database";
import type {
  NotificationCandidate,
  NotificationCategory,
  NotificationRuleContext,
  NotificationRuleDefinition,
} from "./types";

/** Insight rules about money: payments, sales, refunds and ad returns. */
const MONEY_RULE_PREFIXES = ["payments.", "commerce.", "advertising."];
const MONEY_RULES = ["cross_provider.ad_spend_up_orders_down"];
/** Insight rules about what customers say: low reviews and falling ratings. */
const CUSTOMER_RULE_PREFIXES = ["reviews."];

/**
 * Which Action Centre category an insight belongs in, if it needs someone to act rather than
 * just being worth knowing: money and customer insights at warning or critical level.
 * Informational and good-news insights stay as insights.
 */
export function insightActionCategory(insight: {
  rule_id: string;
  severity: string;
}): NotificationCategory | null {
  if (insight.severity !== "warning" && insight.severity !== "critical") return null;
  if (
    MONEY_RULES.includes(insight.rule_id) ||
    MONEY_RULE_PREFIXES.some((prefix) => insight.rule_id.startsWith(prefix))
  )
    return "financial";
  if (CUSTOMER_RULE_PREFIXES.some((prefix) => insight.rule_id.startsWith(prefix)))
    return "customer";
  return null;
}

export const insightNeedsAction = (insight: {rule_id: string; severity: string}) =>
  insightActionCategory(insight) !== null;

/**
 * Turns urgent insights of one category into Action Centre items, so they can be assigned,
 * snoozed and tracked (and emailed to people who turn email on). An item resolves itself when
 * its insight is resolved, dismissed or stops appearing, because the engine resolves items a
 * rule no longer reports.
 */
function insightActionRule(definition: {
  key: string;
  name: string;
  description: string;
  category: "financial" | "customer";
}): NotificationRuleDefinition {
  const rule: NotificationRuleDefinition = {
    key: definition.key,
    version: 1,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    defaultSeverity: "warning",
    async evaluate(c: NotificationRuleContext): Promise<NotificationCandidate[]> {
      const {data} = await c.client
        .from("insights")
        .select(
          "id,title,summary,explanation,recommendation,severity,confidence,rule_id,updated_at",
        )
        .eq("organisation_id", c.organisationId)
        .in("status", ["active", "acknowledged"])
        .order("updated_at", {ascending: false})
        .limit(c.limit);
      return (data ?? [])
        .filter((insight) => insightActionCategory(insight) === definition.category)
        .map((insight) => ({
          organisationId: c.organisationId,
          ruleKey: rule.key,
          ruleVersion: rule.version,
          category: rule.category,
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
            rule.key,
            String(rule.version),
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
  return rule;
}

const insightRequiresAction = insightActionRule({
  key: "insight_requires_action",
  name: "Insight needs action",
  description: "A money-related insight at warning or critical level needs someone to act.",
  category: "financial",
});

const reviewNeedsAttention = insightActionRule({
  key: "review_needs_attention",
  name: "Review needs attention",
  description: "Unanswered low reviews or a falling app rating need someone to look and reply.",
  category: "customer",
});

export const insightNotificationRules = [insightRequiresAction, reviewNeedsAttention];
