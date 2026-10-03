import type {TranslationContext} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import type {VercelDeployment} from "./types";

const TERMINAL = new Set(["READY", "ERROR", "CANCELED", "CANCELLED"]);

export function isTerminalDeployment(state: string) {
  return TERMINAL.has(state);
}

export function translateVercelDeployment(
  deployment: VercelDeployment,
  context: TranslationContext,
): NormalisedEventInput | null {
  if (!isTerminalDeployment(deployment.state)) return null;
  const production = deployment.target === "production",
    failed = deployment.state === "ERROR",
    canceled = deployment.state === "CANCELED" || deployment.state === "CANCELLED",
    name = deployment.projectName,
    where = production ? "Production" : "Preview";
  const title = (
    failed
      ? `Deploy failed on ${name}`
      : canceled
        ? `Deploy canceled on ${name}`
        : `${where} deploy ready on ${name}`
  ).slice(0, 200);
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "vercel",
    category: "development",
    eventType: failed
      ? "vercel.deployment.failed"
      : canceled
        ? "vercel.deployment.canceled"
        : "vercel.deployment.ready",
    title,
    severity: failed ? "critical" : canceled ? "warning" : production ? "good" : "info",
    occurredAt: new Date(deployment.createdMs).toISOString(),
    externalId: `vercel:${deployment.id}`,
    rawPayload: {},
    metadata: {
      projectId: deployment.projectId,
      project: name,
      target: production ? "production" : "preview",
      state: deployment.state,
      ...(deployment.url ? {url: `https://${deployment.url}`} : {}),
      ...(deployment.branch ? {branch: deployment.branch} : {}),
    },
  };
}
