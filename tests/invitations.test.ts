import {describe, expect, it} from "vitest";
import {invitationEmail, notificationEmail} from "@/lib/email/templates";
import {safeNext} from "@/lib/auth/next";

describe("invitation email", () => {
  const email = invitationEmail({
    organisationName: "Hutch & Co",
    inviterName: "Tasha",
    role: "manager",
    acceptUrl: "https://www.metricmage.co.uk/invite/abc",
    expiresAt: "2026-10-10T12:00:00Z",
  });

  it("says who invited them, to what, and what they can do", () => {
    expect(email.subject).toBe("Tasha invited you to join Hutch & Co on Metric Mage");
    expect(email.html).toContain("Join Hutch &amp; Co on Metric Mage");
    expect(email.html).toContain("As a manager you can handle alerts, tasks and approvals.");
    expect(email.text).toContain("works until 10 October");
  });

  it("links to the invitation and explains why they got it, without a preferences link", () => {
    expect(email.html).toContain('href="https://www.metricmage.co.uk/invite/abc"');
    expect(email.text).toContain("Accept invitation: https://www.metricmage.co.uk/invite/abc");
    expect(email.text).toContain("If you weren't expecting it, you can ignore it.");
    expect(email.html).not.toContain("notification preferences");
  });

  it("keeps the preferences link on alert emails", () => {
    const alert = notificationEmail({
      appUrl: "https://app.test",
      organisationName: "Acme",
      notification: {id: "n1", title: "T", summary: "S", recommended_action: "", severity: "info"},
    });
    expect(alert.html).toContain("notification preferences");
  });
});

describe("returning after sign-in", () => {
  it("allows pages on this site", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/app/team")).toBe("/app/team");
  });

  it("refuses other websites and odd values", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", undefined, 5])
      expect(safeNext(bad)).toBe("/app");
    expect(safeNext("//evil.com", "")).toBe("");
  });
});
