import type {
  IntegrationConnector,
  IntegrationSyncContext,
  RawProviderRecord,
  TranslationContext,
} from "../connector";
import {VercelClient, VercelError} from "./client";
import {VERCEL_LIMITS} from "./config";
import {isTerminalDeployment, translateVercelDeployment} from "./translator";
import type {VercelDeployment, VercelSettings} from "./types";

export function selectedVercelProjects(settings: {selectedProjectIds?: unknown}) {
  return Array.isArray(settings.selectedProjectIds)
    ? settings.selectedProjectIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
}

export class VercelConnector implements IntegrationConnector {
  readonly provider = "vercel";
  private error?: unknown;
  constructor(
    private client: VercelClient,
    private settings: VercelSettings,
  ) {}
  connect = async () => ({ok: true});
  disconnect = async () => ({ok: true});
  refresh = async () => ({ok: true});
  healthError = () => this.error;
  async healthCheck() {
    try {
      await this.client.projects(this.settings.teamId, 1);
      return "healthy" as const;
    } catch (error) {
      this.error = error;
      return error instanceof VercelError && error.kind === "unauthorized"
        ? ("expired" as const)
        : ("error" as const);
    }
  }
  translate(record: RawProviderRecord, context: TranslationContext) {
    return translateVercelDeployment(record as unknown as VercelDeployment, context);
  }
  async sync(context: IntegrationSyncContext) {
    const selected = selectedVercelProjects(this.settings);
    if (!selected.length)
      throw new VercelError("configuration", "Choose at least one Vercel project to watch.");
    const start = (this.settings.rotationIndex ?? 0) % selected.length,
      count = Math.min(VERCEL_LIMITS.projectsPerSync, selected.length),
      batch = Array.from(
        {length: count},
        (_, index) => selected[(start + index) % selected.length],
      ),
      events = [];
    let received = 0,
      filtered = 0,
      failures = 0;
    for (const projectId of batch) {
      let deployments: VercelDeployment[];
      try {
        deployments = await this.client.deployments(this.settings.teamId, projectId);
      } catch (error) {
        if (
          error instanceof VercelError &&
          (error.kind === "unauthorized" || error.kind === "rate_limit")
        )
          throw error;
        failures++;
        continue;
      }
      received += deployments.length;
      for (const deployment of deployments) {
        if (!isTerminalDeployment(deployment.state)) {
          filtered++;
          continue;
        }
        const event = translateVercelDeployment(deployment, {
          ...context,
          receivedAt: context.receivedAt ?? new Date().toISOString(),
        });
        if (event) events.push(event);
      }
    }
    if (failures === batch.length)
      throw new VercelError("permission", "No selected Vercel project could be read.");
    return {
      received,
      events,
      filtered,
      pages: batch.length,
      settings: {
        ...this.settings,
        rotationIndex: (start + batch.length) % selected.length,
        lastSyncAt: new Date().toISOString(),
      },
    };
  }
}
