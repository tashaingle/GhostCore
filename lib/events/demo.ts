import type { NormalisedEventInput } from "@/types/events";
export function createDemoEvents(organisationId:string, now = new Date()): NormalisedEventInput[] {
  const ago = (hours:number) => new Date(now.getTime()-hours*3600000).toISOString();
  const rows = [
    ["stripe","finance","payment.received","Payment received","£2,450 payment received from Acme Ltd","good",1],
    ["google_analytics","marketing","traffic.increased","Website traffic increased","Sessions are up 24% week over week","good",3],
    ["google_analytics","marketing","conversions.dropped","Conversions dropped","Checkout conversion rate fell below the target","warning",6],
    ["github","development","deployment.completed","Deployment completed","Production deployment completed successfully","good",9],
    ["website","website","form.error","Website form error detected","Contact form submissions are failing validation","critical",13],
    ["gmail","communication","email.important","Important client email","A key client requested a contract update","info",20],
    ["google_calendar","calendar","meeting.cancelled","Meeting cancelled","Quarterly planning meeting was cancelled","warning",28],
    ["accounting","finance","invoice.overdue","Invoice overdue","Invoice INV-1042 is seven days overdue","warning",36],
  ] as const;
  return rows.map(([source,category,eventType,title,description,severity,hours], i) => ({
    organisationId, source, category, eventType, title, description, severity, occurredAt:ago(hours),
    externalId:`ghost-demo-v1-${i+1}`, metadata:{ demo:true }, rawPayload:{ generatedBy:"ghost-core" },
  }));
}
