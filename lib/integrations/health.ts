import type {IntegrationHealth} from "./connector";
export function healthFromStatus(status:string|undefined):IntegrationHealth{
  if(status==="connected")return "healthy";if(status==="syncing")return "syncing";if(status==="error")return "error";
  if(status==="expired")return "expired";if(status==="disconnected")return "disconnected";return "unknown";
}
export const healthLabels:Record<IntegrationHealth,string>={healthy:"Healthy",syncing:"Syncing",error:"Error",expired:"Expired",disconnected:"Disconnected",unknown:"Unknown"};
