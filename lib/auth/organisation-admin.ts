import {requirePermission} from "./permissions";
export function requireOrganisationAdmin(role:string){requirePermission(role,"integration.manage")}
