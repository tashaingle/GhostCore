export type WorkspaceMembership<T={id:string}>={organisation_id:string;organisation:T};
export function selectActiveMembership<T extends WorkspaceMembership<{id:string}>>(memberships:T[],cookieId?:string|null,profileId?:string|null):T|null{return memberships.find(item=>item.organisation_id===cookieId)??memberships.find(item=>item.organisation_id===profileId)??memberships[0]??null}
export const invitationDisplayStatus=(status:string,expiresAt:string,now=new Date())=>status==="pending"&&new Date(expiresAt)<=now?"expired":status;
