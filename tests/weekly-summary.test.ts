import {afterEach, describe, expect, it, vi} from "vitest";
import {emailFigures, lastWeekLabel, mondayMorning} from "@/lib/email/weekly-summary";
import {weeklySummaryEmail} from "@/lib/email/templates";
import {readUnsubscribeToken, unsubscribeToken} from "@/lib/email/unsubscribe";

const ORG = "11111111-1111-4111-8111-111111111111",
  USER = "22222222-2222-4222-8222-222222222222";

describe("when the Monday email goes out", () => {
  it("is due from 7am on Monday in the organisation's own time zone", () => {
    // 06:30 UTC on Monday 12 Oct = 07:30 in London (BST): due.
    expect(mondayMorning(new Date("2026-10-12T06:30:00Z"), "Europe/London")).toEqual({
      due: true,
      weekKey: "2026-10-12",
    });
    // 05:30 UTC = 06:30 London: too early.
    expect(mondayMorning(new Date("2026-10-12T05:30:00Z"), "Europe/London").due).toBe(false);
    // Already Monday 07:00 in Sydney while it's still Sunday in London.
    expect(mondayMorning(new Date("2026-10-11T21:00:00Z"), "Australia/Sydney").due).toBe(true);
    expect(mondayMorning(new Date("2026-10-13T08:00:00Z"), "Europe/London").due).toBe(false);
  });

  it("labels the week just gone", () => {
    expect(lastWeekLabel(new Date("2026-10-12T07:00:00Z"), "Europe/London")).toBe("5–11 October");
    expect(lastWeekLabel(new Date("2026-11-02T08:00:00Z"), "Europe/London")).toBe(
      "26 October – 1 November",
    );
  });
});

describe("what the Monday email says", () => {
  const email = weeklySummaryEmail({
    appUrl: "https://www.metricmage.co.uk",
    organisationName: "Hutch & Co",
    firstName: "Tasha",
    weekLabel: "5–11 October",
    goingWell: ["Revenue up 12% to £4,250 compared with last week"],
    needsLook: ["Shopify needs reconnecting"],
    figures: emailFigures([
      {
        key: "revenue",
        group: "Money",
        label: "Revenue",
        value: "£4,250",
        change: 12,
        source: "Stripe",
        higherIsBetter: true,
        comparable: true,
      },
      {
        key: "refunds",
        group: "Money",
        label: "Refunds",
        value: "14",
        change: 100,
        source: "Stripe",
        higherIsBetter: false,
        comparable: true,
      },
      {
        key: "adSpend",
        group: "Marketing",
        label: "Ad spend",
        value: "£380",
        change: -8,
        source: "Meta",
        higherIsBetter: null,
        comparable: false,
      },
    ]),
    waiting: 3,
    unsubscribeUrl: "https://www.metricmage.co.uk/unsubscribe?token=abc",
  });

  it("leads the subject with the headline", () => {
    expect(email.subject).toBe("Your week at Hutch & Co: revenue up 12% to £4,250");
  });

  it("covers going well, needs a look, what's waiting and the key numbers", () => {
    expect(email.text).toContain("Morning Tasha. Here's how 5–11 October went");
    expect(email.text).toContain("3 things are waiting for you in the Action Centre.");
    expect(email.text).toContain("Going well\n- Revenue up 12%");
    expect(email.text).toContain("Needs a look\n- Shopify needs reconnecting");
    // Biggest moves first; refunds rising is shown, and a figure with no history shows "–".
    expect(email.text).toContain(
      "Refunds: 14 (▲ 100%)\nRevenue: £4,250 (▲ 12%)\nAd spend: £380 (–)",
    );
    expect(email.html).toContain("Hutch &amp; Co");
  });

  it("colours rises in refunds as bad and rises in revenue as good", () => {
    expect(email.html).toMatch(/Refunds<\/td>.*?#b45309/);
    expect(email.html).toMatch(/Revenue<\/td>.*?#047857/);
  });

  it("always offers a way to stop them", () => {
    expect(email.html).toContain('href="https://www.metricmage.co.uk/unsubscribe?token=abc"');
    expect(email.text).toContain(
      "Stop these emails: https://www.metricmage.co.uk/unsubscribe?token=abc",
    );
  });
});

describe("unsubscribe links", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only work unaltered, for the person and organisation they were made for", () => {
    vi.stubEnv("GITHUB_TOKEN_ENCRYPTION_KEY", "test-secret");
    const token = unsubscribeToken(ORG, USER);
    expect(readUnsubscribeToken(token)).toEqual({organisationId: ORG, userId: USER});
    const [payload] = token.split(".");
    const forged = `${Buffer.from(`${ORG}.33333333-3333-4333-8333-333333333333`).toString("base64url")}.${token.split(".")[1]}`;
    expect(readUnsubscribeToken(forged)).toBeNull();
    expect(readUnsubscribeToken(`${payload}.wrong`)).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
  });
});

describe("why things needed a look", () => {
  it("adds the reason from the other tools after each item, but not to the subject", () => {
    const email = weeklySummaryEmail({
      appUrl: "https://www.metricmage.co.uk",
      organisationName: "Hutch & Co",
      firstName: null,
      weekLabel: "5–11 October",
      goingWell: [],
      needsLook: ["Orders down 30% to 14 compared with last week"],
      reasons: {
        "Orders down 30% to 14 compared with last week":
          "Your Meta ads stopped spending on Tuesday 6 Oct, so the Meta ads stopping is the most likely reason.",
      },
      figures: [],
      waiting: 0,
      unsubscribeUrl: "https://www.metricmage.co.uk/unsubscribe?token=abc",
    });
    expect(email.subject).toBe("Your week at Hutch & Co: orders down 30% to 14");
    expect(email.text).toContain(
      "- Orders down 30% to 14. Your Meta ads stopped spending on Tuesday 6 Oct",
    );
  });
});
