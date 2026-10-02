export type MembershipSummary = {
  organisationId: string;
  name: string;
  role: string;
  /** Active members, including this user. */
  memberCount: number;
  /** Active owners, including this user if they are one. */
  ownerCount: number;
};

export type AccountDeletionPlan = {
  /** Organisations that only this user belongs to; deleted along with the account. */
  deleteOrganisations: {id: string; name: string}[];
  /** Organisations that would be left with members but no owner; deletion must wait. */
  blockers: {id: string; name: string}[];
  /** Organisations the user simply leaves. */
  leaveOrganisations: {id: string; name: string}[];
};

/**
 * Decides what deleting an account means for each organisation. A team is never left without an
 * owner: if this user is its only owner and others remain, they must hand over ownership (or
 * delete the organisation) first.
 */
export function planAccountDeletion(memberships: MembershipSummary[]): AccountDeletionPlan {
  const plan: AccountDeletionPlan = {deleteOrganisations: [], blockers: [], leaveOrganisations: []};
  for (const m of memberships) {
    const org = {id: m.organisationId, name: m.name};
    if (m.memberCount <= 1) plan.deleteOrganisations.push(org);
    else if (m.role === "owner" && m.ownerCount <= 1) plan.blockers.push(org);
    else plan.leaveOrganisations.push(org);
  }
  return plan;
}

/** Typed confirmation for deleting an organisation: its exact name, ignoring outer spaces. */
export const confirmsOrganisationName = (typed: unknown, name: string) =>
  typeof typed === "string" && typed.trim() === name.trim() && name.trim().length > 0;

export const ACCOUNT_DELETE_PHRASE = "DELETE";
export const confirmsAccountDeletion = (typed: unknown) =>
  typeof typed === "string" && typed.trim() === ACCOUNT_DELETE_PHRASE;
