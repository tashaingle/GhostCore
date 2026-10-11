import {describe, expect, it} from "vitest";
import {goalProgress, monthWindow, type Goal, type GoalData} from "@/lib/goals/progress";
import {hasPermission} from "@/lib/auth/permissions";

const revenue: Goal = {id: "g1", metric: "revenue", target: 5000, currency: "GBP"};
const orders: Goal = {id: "g2", metric: "orders", target: 100, currency: null};
const empty: GoalData = {payments: [], manualSales: [], orders: []};
/** £`pounds` paid on the given day of October 2026. */
const paid = (day: number, pounds: number, live = true) => ({
  at: Date.parse(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`),
  amountMinor: pounds * 100,
  currency: "GBP",
  live,
});
const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`);

describe("the month", () => {
  it("starts at local midnight, so BST is respected", () => {
    const m = monthWindow(at(11));
    expect(new Date(m.start).toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(new Date(m.end).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(m.name).toBe("October");
    expect(m.lastDay).toBe("31 October");
  });
});

describe("goal progress", () => {
  it("is on track when the pace would reach the target", () => {
    const g = goalProgress(revenue, {...empty, payments: [paid(3, 1500), paid(9, 1500)]}, at(16));
    expect(g.status).toBe("on_track");
    expect(g.valueText).toBe("£3,000 of £5,000");
    expect(g.summary).toMatch(/^At this pace you'll reach about £\d,\d00 by 31 October\.$/);
  });

  it("says how far short and what it would take when behind", () => {
    const g = goalProgress(revenue, {...empty, payments: [paid(5, 1000)]}, at(16));
    expect(g.status).toBe("behind");
    expect(g.summary).toMatch(
      /^At this pace you'll reach about £[\d,]+, £[\d,]+ short\. You'd need about £\d+ a day for the rest of the month\.$/,
    );
  });

  it("calls a near miss 'just behind'", () => {
    const g = goalProgress(revenue, {...empty, payments: [paid(5, 2400)]}, at(16));
    expect(g.status).toBe("close");
  });

  it("doesn't judge in the first days of the month", () => {
    expect(goalProgress(revenue, {...empty, payments: [paid(1, 10)]}, at(3)).status).toBe("early");
  });

  it("is reached once the target is met, whenever that is", () => {
    const g = goalProgress(revenue, {...empty, payments: [paid(2, 5200)]}, at(4));
    expect(g.status).toBe("done");
    expect(g.summary).toBe("Goal reached for October.");
  });

  it("adds sales recorded by hand, and ignores other currencies and other months", () => {
    const g = goalProgress(
      revenue,
      {
        payments: [paid(5, 1000), {...paid(5, 900), currency: "USD"}],
        manualSales: [
          {at: at(6).getTime(), amount: 250, currency: "GBP"},
          {at: Date.parse("2026-09-30T12:00:00Z"), amount: 999, currency: "GBP"},
        ],
        orders: [],
      },
      at(16),
    );
    expect(g.value).toBe(1250);
  });

  it("uses Stripe test payments only before there are live ones, and says so", () => {
    expect(
      goalProgress(revenue, {...empty, payments: [paid(5, 100, false)]}, at(16)).testMode,
    ).toBe(true);
    const mixed = goalProgress(
      revenue,
      {...empty, payments: [paid(5, 100, false), paid(6, 300)]},
      at(16),
    );
    expect(mixed.testMode).toBe(false);
    expect(mixed.value).toBe(300);
  });

  it("counts orders and talks in orders a day", () => {
    const g = goalProgress(
      orders,
      {...empty, orders: Array.from({length: 20}, (_, i) => ({at: at(1 + (i % 14)).getTime()}))},
      at(16),
    );
    expect(g.valueText).toBe("20 of 100");
    expect(g.status).toBe("behind");
    expect(g.summary).toMatch(/You'd need about \d+ orders a day/);
  });
});

describe("who can set goals", () => {
  it("lets owners, admins and managers set goals, and everyone else just see them", () => {
    expect(hasPermission("owner", "goals.manage")).toBe(true);
    expect(hasPermission("admin", "goals.manage")).toBe(true);
    expect(hasPermission("manager", "goals.manage")).toBe(true);
    expect(hasPermission("member", "goals.manage")).toBe(false);
    expect(hasPermission("viewer", "goals.manage")).toBe(false);
  });
});
