import {describe, expect, it} from "vitest";
import {hasPermission, canManageRole, ORGANISATION_ROLES} from "@/lib/auth/permissions";
import {isParkedOrganisation} from "@/lib/organisations/focus";
import {selectActiveMembership, invitationDisplayStatus} from "@/lib/organisations/selection";
describe("multi-organisation workspaces", () => {
  const memberships = [
    {organisation_id: "one", organisation: {id: "one", name: "One"}},
    {organisation_id: "two", organisation: {id: "two", name: "Two"}},
  ];
  it("selects the cookie workspace before the stored preference", () =>
    expect(selectActiveMembership(memberships, "two", "one")?.organisation.id).toBe("two"));
  it("restores the stored workspace and safely falls back after access removal", () => {
    expect(selectActiveMembership(memberships, null, "two")?.organisation.id).toBe("two");
    expect(selectActiveMembership(memberships, "removed", "removed")?.organisation.id).toBe("one");
  });
  it("supports all five roles", () =>
    expect(ORGANISATION_ROLES).toEqual(["owner", "admin", "manager", "member", "viewer"]));
  it("keeps viewers read-only", () => {
    expect(hasPermission("viewer", "workspace.read")).toBe(true);
    expect(hasPermission("viewer", "event.create")).toBe(false);
    expect(hasPermission("viewer", "integration.sync")).toBe(false);
  });
  it("allows managers to operate but not administer", () => {
    expect(hasPermission("manager", "integration.sync")).toBe(true);
    expect(hasPermission("manager", "team.invite")).toBe(false);
    expect(hasPermission("manager", "organisation.edit")).toBe(false);
  });
  it("prevents admins from changing owner or peer admin roles", () => {
    expect(canManageRole("admin", "owner")).toBe(false);
    expect(canManageRole("admin", "admin")).toBe(false);
    expect(canManageRole("admin", "member")).toBe(true);
  });
  it("recognises expired pending invitations without changing accepted records", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    expect(invitationDisplayStatus("pending", "2026-07-27T00:00:00Z", now)).toBe("expired");
    expect(invitationDisplayStatus("accepted", "2026-07-27T00:00:00Z", now)).toBe("accepted");
  });
  it("parks Tash, Rabbit Care and Unhinged Clothing without hiding the live projects", () => {
    expect(isParkedOrganisation("Tash")).toBe(true);
    expect(isParkedOrganisation("Rabbit Care")).toBe(true);
    expect(isParkedOrganisation("Unhinged Clothing")).toBe(true);
    expect(isParkedOrganisation("XUFU")).toBe(false);
    expect(isParkedOrganisation("Carprise")).toBe(false);
    expect(isParkedOrganisation("Prestige Cars")).toBe(false);
    expect(isParkedOrganisation("Tzkia")).toBe(false);
  });
  it("keeps tenant selection isolated to the supplied membership set", () =>
    expect(selectActiveMembership(memberships, "foreign", null)?.organisation.id).not.toBe(
      "foreign",
    ));
});
