import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {
  describePrice,
  hasAccess,
  isCancelling,
  monthlyMinor,
  toBillingStatus,
} from "@/lib/billing/plan";

describe("pricing", () => {
  it("is £4.99 for up to three organisations, then £1 each", () => {
    expect(monthlyMinor(0)).toBe(499);
    expect(monthlyMinor(1)).toBe(499);
    expect(monthlyMinor(3)).toBe(499);
    expect(monthlyMinor(4)).toBe(599);
    expect(monthlyMinor(10)).toBe(1199);
  });

  it("explains the price in plain English", () => {
    expect(describePrice(2)).toBe("£4.99 a month, including up to 3 organisations");
    expect(describePrice(5)).toBe(
      "£6.99 a month for 5 organisations (3 included, then £1.00 each)",
    );
  });
});

describe("access", () => {
  it("allows trials, paying customers, failed payments still retrying, and comped accounts", () => {
    for (const status of ["trialing", "active", "past_due"])
      expect(hasAccess({status, comped: false})).toBe(true);
    expect(hasAccess({status: "none", comped: true})).toBe(true);
  });

  it("pauses everyone else", () => {
    for (const status of [
      "none",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ])
      expect(hasAccess({status, comped: false})).toBe(false);
    expect(hasAccess(null)).toBe(false);
  });

  it("stores Stripe's statuses and treats anything unknown as none", () => {
    expect(toBillingStatus("trialing")).toBe("trialing");
    expect(toBillingStatus("something_new")).toBe("none");
  });
});

describe("billing migration", () => {
  const sql = readFileSync("supabase/migrations/202610100001_billing.sql", "utf8");

  it("lets people read only their own billing, and nobody write it from the browser", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select using (user_id = auth.uid())");
    expect(sql).not.toMatch(/for (insert|update|delete|all)/);
  });

  it("only tells members whether their organisation has access, using the same rule", () => {
    expect(sql).toContain("b.comped or b.status in ('trialing', 'active', 'past_due')");
    expect(sql).toContain("m.user_id = auth.uid()");
  });
});

describe("cancelling", () => {
  it("counts the billing portal's cancel date as cancelled, as well as the older flag", () => {
    expect(isCancelling({cancel_at_period_end: false, cancel_at: 1_792_000_000})).toBe(true);
    expect(isCancelling({cancel_at_period_end: true, cancel_at: null})).toBe(true);
    expect(isCancelling({cancel_at_period_end: false, cancel_at: null})).toBe(false);
  });
});
