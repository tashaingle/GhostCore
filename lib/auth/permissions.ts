export const ORGANISATION_ROLES=["owner","admin","manager","member","viewer"] as const;
export type OrganisationRole=typeof ORGANISATION_ROLES[number];
export const PERMISSIONS=["organisation.edit","team.view","team.invite","team.manage","integration.manage","integration.sync","event.create","insight.manage","correlation.manage","correlation.run","workspace.read"] as const;
export type Permission=typeof PERMISSIONS[number];
const grants:Record<OrganisationRole,readonly Permission[]>={
  owner:PERMISSIONS,
  admin:["organisation.edit","team.view","team.invite","team.manage","integration.manage","integration.sync","event.create","insight.manage","correlation.manage","correlation.run","workspace.read"],
  manager:["team.view","integration.sync","event.create","insight.manage","correlation.run","workspace.read"],
  member:["event.create","insight.manage","workspace.read"],
  viewer:["workspace.read"],
};
export const hasPermission=(role:OrganisationRole,permission:Permission)=>grants[role].includes(permission);
export function requirePermission(role:string,permission:Permission){if(!ORGANISATION_ROLES.includes(role as OrganisationRole)||!hasPermission(role as OrganisationRole,permission))throw new Error("You do not have permission to perform this action.")}
export const canManageRole=(actor:OrganisationRole,target:OrganisationRole)=>actor==="owner"||(actor==="admin"&&!["owner","admin"].includes(target));
