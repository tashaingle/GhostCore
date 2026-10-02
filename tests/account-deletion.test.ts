import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {
  confirmsAccountDeletion,
  confirmsOrganisationName,
  planAccountDeletion,
} from "@/lib/account/deletion";

const m = (id: string, role: string, memberCount: number, ownerCount: number) => ({
  organisationId: id,
  name: id.toUpperCase(),
  role,
  memberCount,
  ownerCount,
});

describe("account deletion plan", () => {
  it("deletes organisations the user is the only member of", () => {
    expect(planAccountDeletion([m("solo", "owner", 1, 1)])).toEqual({
      deleteOrganisations: [{id: "solo", name: "SOLO"}],
      blockers: [],
      leaveOrganisations: [],
    });
  });

  it("never leaves a team without an owner", () => {
    const plan = planAccountDeletion([m("team", "owner", 3, 1)]);
    expect(plan.blockers).toEqual([{id: "team", name: "TEAM"}]);
    expect(plan.deleteOrganisations).toEqual([]);
  });

  it("lets the user leave when another owner remains or they aren't an owner", () => {
    const plan = planAccountDeletion([m("co-owned", "owner", 3, 2), m("member", "member", 4, 1)]);
    expect(plan.leaveOrganisations.map((o) => o.id)).toEqual(["co-owned", "member"]);
    expect(plan.blockers).toEqual([]);
  });
});

describe("deletion confirmations", () => {
  it("requires the exact organisation name", () => {
    expect(confirmsOrganisationName("XUFU", "XUFU")).toBe(true);
    expect(confirmsOrganisationName("  XUFU ", "XUFU")).toBe(true);
    expect(confirmsOrganisationName("xufu", "XUFU")).toBe(false);
    expect(confirmsOrganisationName("", "")).toBe(false);
    expect(confirmsOrganisationName(null, "XUFU")).toBe(false);
  });

  it("requires DELETE in capitals to delete an account", () => {
    expect(confirmsAccountDeletion("DELETE")).toBe(true);
    expect(confirmsAccountDeletion("delete")).toBe(false);
    expect(confirmsAccountDeletion(undefined)).toBe(false);
  });
});

describe("database support for deletion", () => {
  const sql = readFileSync("supabase/migrations/202607290017_allow_account_delete.sql", "utf8");

  it("clears user references by default and cascades memberships and profiles", () => {
    expect(sql).toContain("confrelid = 'auth.users'::regclass");
    expect(sql).toContain("'set null'");
    expect(sql).toMatch(/fk\.tbl = 'organisation_members' and fk\.col = 'user_id'/);
    expect(sql).toContain("fk.tbl = 'profiles'");
  });
});
