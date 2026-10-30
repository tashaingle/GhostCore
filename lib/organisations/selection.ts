export type WorkspaceMembership<T = {id: string}> = {organisation_id: string; organisation: T};
export function selectActiveMembership<T extends WorkspaceMembership<{id: string}>>(
  memberships: T[],
  cookieId?: string | null,
  profileId?: string | null,
): T | null {
  return (
    memberships.find((item) => item.organisation_id === cookieId) ??
    memberships.find((item) => item.organisation_id === profileId) ??
    memberships[0] ??
    null
  );
}
export const invitationDisplayStatus = (status: string, expiresAt: string, now = new Date()) =>
  status === "pending" && new Date(expiresAt) <= now ? "expired" : status;

export type WorkspaceSummary = {
  id: string;
  name: string;
  /** The user created it. */
  mine: boolean;
  /** The user's businesses in it, in membership order. */
  organisationIds: string[];
};

/** The user's workspaces, in the order they first joined a business in each. */
export function groupWorkspaces(
  organisations: {id: string; workspaceId: string}[],
  rows: {id: string; name: string; created_by: string | null}[],
  userId: string,
): WorkspaceSummary[] {
  const byId = new Map<string, WorkspaceSummary>();
  for (const organisation of organisations) {
    const row = rows.find((item) => item.id === organisation.workspaceId);
    const found = byId.get(organisation.workspaceId);
    if (found) found.organisationIds.push(organisation.id);
    else
      byId.set(organisation.workspaceId, {
        id: organisation.workspaceId,
        name: row?.name ?? "Workspace",
        mine: row?.created_by === userId,
        organisationIds: [organisation.id],
      });
  }
  return [...byId.values()];
}
