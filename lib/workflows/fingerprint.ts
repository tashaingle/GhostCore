import{createHash}from"node:crypto";
const stable=(value:unknown):string=>{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`};
export const executionFingerprint=(input:{organisationId:string;workflowId:string;version:number;triggerType:string;sourceId?:string|null;payload?:unknown})=>createHash("sha256").update(stable(input)).digest("hex");
export const retryDelay=(attempt:number)=>Math.min(3600000,30000*2**Math.max(0,attempt-1));
