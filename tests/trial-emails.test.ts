import {describe, expect, it} from "vitest";
import {trialStage} from "@/lib/email/trial-emails";
import {trialDayOneEmail, trialEndingEmail, trialNextStep} from "@/lib/email/templates";

const ends = "2026-10-17T19:35:00Z";
const trial = (over = {}) => ({
  status: "trialing",
  trial_ends_at: ends,
  cancel_at_period_end: false,
  ...over,
});
const at = (iso: string) => new Date(iso);

describe("which trial email is due", () => {
  it("sends nothing on the first day", () => {
    expect(trialStage(trial(), at("2026-10-10T20:00:00Z"))).toBeNull();
  });

  it("sends the day-one email from a day after starting", () => {
    expect(trialStage(trial(), at("2026-10-11T20:00:00Z"))).toBe("day_one");
  });

  it("sends the ending email in the last two days, unless they've cancelled", () => {
    expect(trialStage(trial(), at("2026-10-16T09:00:00Z"))).toBe("ending");
    expect(trialStage(trial({cancel_at_period_end: true}), at("2026-10-16T09:00:00Z"))).toBeNull();
  });

  it("stops once the trial is over or the person isn't trialing", () => {
    expect(trialStage(trial(), at("2026-10-18T09:00:00Z"))).toBeNull();
    expect(trialStage(trial({status: "active"}), at("2026-10-11T20:00:00Z"))).toBeNull();
    expect(trialStage(trial({trial_ends_at: null}), at("2026-10-11T20:00:00Z"))).toBeNull();
  });
});

const progress = {
  organisationName: "Hutch & Co",
  firstName: "Sam",
  tools: ["Shopify", "Stripe"],
  updates: 1240,
  noticed: ["Refunds on the large hutch are climbing"],
  teammates: 0,
};

describe("trial emails", () => {
  it("suggest the most useful next step", () => {
    const app = "https://www.metricmage.co.uk";
    expect(trialNextStep({...progress, tools: []}, app).label).toBe("Connect a tool");
    expect(trialNextStep({...progress, tools: ["Shopify"]}, app).label).toBe(
      "Connect another tool",
    );
    expect(trialNextStep(progress, app).label).toBe("Invite your team");
    expect(trialNextStep({...progress, teammates: 2}, app).label).toBe("Open Metric Mage");
  });

  it("day one: what it's found so far", () => {
    const email = trialDayOneEmail({...progress, appUrl: "https://www.metricmage.co.uk"});
    expect(email.subject).toBe("Day 1 at Hutch & Co: here's what Metric Mage found");
    expect(email.text).toContain("Connected: Shopify, Stripe");
    expect(email.text).toContain("1,240 updates brought in from your tools");
    expect(email.text).toContain("Refunds on the large hutch are climbing");
    expect(email.text).toContain("Invite your team: https://www.metricmage.co.uk/app/team");
  });

  it("day one with nothing connected asks them to connect a tool", () => {
    const email = trialDayOneEmail({
      ...progress,
      tools: [],
      updates: 0,
      noticed: [],
      appUrl: "https://x.test",
    });
    expect(email.subject).toBe("Your Metric Mage trial: connect your first tool");
    expect(email.text).toContain("No tools connected yet");
  });

  it("ending: says plainly when and how much they'll be charged, and how to cancel", () => {
    const email = trialEndingEmail({
      ...progress,
      appUrl: "https://www.metricmage.co.uk",
      endsOn: "Saturday 17 October",
      price: "£4.99",
    });
    expect(email.subject).toBe("Your Metric Mage trial ends on Saturday 17 October");
    expect(email.text).toContain("your card will be charged £4.99 a month");
    expect(email.text).toContain(
      "you can cancel from Billing before then and you won't be charged",
    );
    expect(email.text).toContain("Manage billing: https://www.metricmage.co.uk/billing");
  });
});
