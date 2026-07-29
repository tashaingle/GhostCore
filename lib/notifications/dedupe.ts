import{createHash}from"node:crypto";import type{NotificationEvidenceInput}from"./types";
const stable=(parts:string[])=>parts.map(x=>x.trim().toLowerCase().replace(/\s+/g," ")).join("\u001f");
export const notificationFingerprint=(parts:string[])=>createHash("sha256").update(stable(parts)).digest("hex");
export const evidenceFingerprint=(e:NotificationEvidenceInput)=>notificationFingerprint([e.evidenceType,e.sourceTable,e.sourceId,e.label,e.occurredAt]);
