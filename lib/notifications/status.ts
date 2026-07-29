import type{NotificationSeverity,NotificationStatus}from"./types";
const transitions:Record<NotificationStatus,NotificationStatus[]>={open:["acknowledged","snoozed","resolved","dismissed"],acknowledged:["open","snoozed","resolved","dismissed"],snoozed:["open","acknowledged","resolved","dismissed"],resolved:["open"],dismissed:["open"]};
export const canTransition=(from:NotificationStatus,to:NotificationStatus)=>from===to||transitions[from].includes(to);
export function detectionTransition(current:{status:NotificationStatus;severity:NotificationSeverity},next:NotificationSeverity){if(next==="critical"&&current.severity!=="critical")return{status:"open"as const,clearSnooze:true,change:"escalated"};return{status:current.status,clearSnooze:false,change:current.severity===next?"detected":"severity_changed"}}
export const severityRank=(severity:string)=>({critical:0,warning:1,info:2}[severity]??3);
export function sortNotifications<T extends{id:string;severity:string;first_detected_at:string}>(items:T[]){return[...items].sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||Date.parse(a.first_detected_at)-Date.parse(b.first_detected_at)||a.id.localeCompare(b.id))}
