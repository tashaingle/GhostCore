import {describe, expect, it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {insightNeedsAction, insightNotificationRules} from "@/lib/notifications/insight-rules";
import {notificationRuleRegistry} from "@/lib/notifications/rules";

describe("which insights need action", () => {
  it("includes money insights at warning or critical", () => {
    for (const rule_id of [
      "payments.stripe_dispute_needs_response",
      "payments.stripe_failure_rate",
      "commerce.shopify_order_decline",
      "advertising.meta_return_decline",
      "cross_provider.ad_spend_up_orders_down",
    ]) {
      expect(insightNeedsAction({rule_id, severity: "warning"}), rule_id).toBe(true);
      expect(insightNeedsAction({rule_id, severity: "critical"}), rule_id).toBe(true);
    }
  });

  it("leaves informational and non-money insights as insights", () => {
    expect(insightNeedsAction({rule_id: "payments.stripe_failure_rate", severity: "info"})).toBe(
      false,
    );
    expect(insightNeedsAction({rule_id: "commerce.shopify_order_decline", severity: "good"})).toBe(
      false,
    );
    expect(
      insightNeedsAction({rule_id: "github.repeated_workflow_failures", severity: "critical"}),
    ).toBe(false);
  });

  it("is registered with the Action Centre engine", () =>
    expect(notificationRuleRegistry.map((r) => r.key)).toContain("insight_requires_action"));
});

describe("insight action items", () => {
  const [rule] = insightNotificationRules;
  const insight = (id: string, rule_id: string, severity: string) => ({
    id,
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    explanation: `Why ${id}`,
    recommendation: `Do ${id}`,
    severity,
    confidence: 90,
    rule_id,
    updated_at: "2026-10-02T12:00:00Z",
  });
  const filters: string[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("insights");
      const chain = {
        select: () => chain,
        eq: (col: string, val: string) => (filters.push(`${col}=${val}`), chain),
        in: (col: string, vals: string[]) => (filters.push(`${col} in ${vals.join(",")}`), chain),
        order: () => chain,
        limit: async () => ({
          data: [
            insight("a", "payments.stripe_dispute_needs_response", "critical"),
            insight("b", "commerce.shopify_order_decline", "warning"),
            insight("c", "analytics.tracking_inactive", "critical"),
          ],
        }),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;

  it("creates one item per urgent insight with its explanation and next step", async () => {
    const items = await rule.evaluate({
      client,
      organisationId: "org",
      now: new Date("2026-10-02T12:00:00Z"),
      limit: 100,
      configuration: {},
    });
    expect(filters).toContain("status in active,acknowledged");
    expect(items.map((i) => i.sourceId)).toEqual(["a", "b"]);
    expect(items[0]).toMatchObject({
      category: "financial",
      severity: "critical",
      title: "Title a",
      recommendedAction: "Do a",
      sourceType: "insight",
    });
    expect(items[1].severity).toBe("warning");
    // One stable item per insight, so repeated runs update it rather than duplicating it.
    expect(items[0].fingerprintParts).toEqual([
      "org",
      "insight_requires_action",
      "1",
      "insight",
      "a",
    ]);
  });
});
