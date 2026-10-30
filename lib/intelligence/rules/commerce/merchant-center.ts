import type {IntelligenceEvent, IntelligenceRule} from "../../types";
import {contextNow, groupBy, isoWeek, metadataString, occurredMs} from "../../windows";

const DAY = 86_400_000;
const FRESH_DAYS = 3;
const BASELINE_DAYS = 6;
const MINIMUM_DISAPPROVED = 5;

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const name = (e: IntelligenceEvent) =>
  metadataString(e.metadata, "sourceEntityName") ?? "your shop";

/** Daily product summaries per Merchant Center account, newest first. */
function summariesByAccount(events: IntelligenceEvent[]) {
  return groupBy(
    events
      .filter((e) => e.eventType === "google_merchant_center.products.daily_summary")
      .sort((a, b) => occurredMs(b) - occurredMs(a)),
    (e) => metadataString(e.metadata, "sourceAccountId"),
  );
}

/**
 * Compares the newest product summary with one from about a week before, and flags a clear rise
 * in disapproved products. It clears itself once the count comes back down.
 */
export const merchantDisapprovalsRisingRule: IntelligenceRule = {
  id: "commerce.merchant_disapprovals_rising",
  name: "More products disapproved in Merchant Center",
  description:
    "Flags when Google turns down noticeably more of your products for Shopping than a week ago.",
  priority: 43,
  supportedProviders: ["google_merchant_center"],
  evaluate(events, context) {
    const now = contextNow(context);
    return [...summariesByAccount(events)].flatMap(([account, items]) => {
      const latest = items[0];
      if (!latest || now.getTime() - occurredMs(latest) > FRESH_DAYS * DAY) return [];
      const baseline = items.find((e) => occurredMs(latest) - occurredMs(e) >= BASELINE_DAYS * DAY);
      if (!baseline) return [];
      const current = num(latest.metadata.disapproved),
        before = num(baseline.metadata.disapproved),
        total = num(latest.metadata.total),
        rise = current - before;
      if (
        current < MINIMUM_DISAPPROVED ||
        rise < Math.max(MINIMUM_DISAPPROVED, Math.ceil(before * 0.5))
      )
        return [];
      const share = total ? Math.round((current / total) * 1000) / 10 : null,
        issues = Array.isArray(latest.metadata.topIssues)
          ? (latest.metadata.topIssues as {reason?: string; products?: number}[])
          : [],
        top = issues.find((i) => i.reason)?.reason;
      return [
        {
          title: `${current} products disapproved in Merchant Center, up from ${before}`,
          summary: `Google is turning down ${rise} more of ${name(latest)}'s products for Shopping than a week ago${share !== null ? `, ${share}% of the catalogue` : ""}.${top ? ` Most common problem: ${top}` : ""}`,
          severity: share !== null && share >= 25 ? ("critical" as const) : ("warning" as const),
          confidence: Math.min(95, 75 + Math.round(rise / 2)),
          explanation:
            "Disapproved products don't appear in free listings or Shopping ads, so they can't bring in sales from Google until they are fixed.",
          recommendation:
            "Open Products > Needs attention in Merchant Center, fix the most common problem first, then send your feed again. Google usually rechecks within a few days.",
          sourceEventIds: [latest.id, baseline.id],
          fingerprintKey: `${account}:${isoWeek(now)}`,
          metadata: {
            account,
            disapproved: current,
            previousDisapproved: before,
            disapprovedPercent: share,
          },
        },
      ];
    });
  },
};

/**
 * Serious problems with the Merchant Center account itself, including suspension warnings. It
 * reads the account's current problems from the newest summary, so it clears once they're fixed.
 */
export const merchantAccountWarningRule: IntelligenceRule = {
  id: "commerce.merchant_account_warning",
  name: "Merchant Center account warning",
  description:
    "Flags account-level problems in Merchant Center that stop products showing, such as a suspension warning.",
  priority: 12,
  supportedProviders: ["google_merchant_center"],
  evaluate(events, context) {
    const now = contextNow(context),
      issueEvents = events.filter(
        (e) =>
          e.eventType === "google_merchant_center.account.issue" ||
          e.eventType === "google_merchant_center.account.suspension_warning",
      );
    return [...summariesByAccount(events)].flatMap(([account, items]) => {
      const latest = items[0];
      if (!latest || now.getTime() - occurredMs(latest) > FRESH_DAYS * DAY) return [];
      const open = (
        Array.isArray(latest.metadata.accountIssues)
          ? (latest.metadata.accountIssues as {
              id?: string;
              title?: string;
              severity?: string;
              suspension?: boolean;
            }[])
          : []
      ).filter((issue) => issue.severity === "critical" || issue.suspension);
      if (!open.length) return [];
      const suspension = open.some((issue) => issue.suspension),
        shop = name(latest),
        titles = open.map((issue) => issue.title).filter(Boolean);
      return [
        {
          title: suspension
            ? `Google has warned that ${shop} could be suspended from Shopping`
            : open.length === 1
              ? `Merchant Center problem: ${titles[0] ?? "account issue"}`
              : `${open.length} serious problems with ${shop}'s Merchant Center account`,
          summary: `Merchant Center reports: ${titles.slice(0, 3).join("; ")}${titles.length > 3 ? "; and more" : ""}.`,
          severity: "critical" as const,
          confidence: 95,
          explanation: suspension
            ? "A suspended account stops every product showing on Google Shopping and in free listings until Google reviews it again."
            : "Account-level problems can stop all of your products showing on Google, not just one.",
          recommendation:
            "Open Merchant Center, go to the account issues, and follow Google's steps. Check your website shows your returns policy, contact details and accurate prices, then ask Google to review it again.",
          sourceEventIds: [
            latest.id,
            ...issueEvents
              .filter((e) => metadataString(e.metadata, "sourceAccountId") === account)
              .slice(0, 20)
              .map((e) => e.id),
          ],
          fingerprintKey: `${account}:${open
            .map((issue) => issue.id ?? "")
            .sort()
            .join(",")}`,
          metadata: {account, suspension, openIssues: open.length},
        },
      ];
    });
  },
};
