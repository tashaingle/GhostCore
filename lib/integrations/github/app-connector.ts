import "server-only";
import type {
  ConnectorOperationResult,
  ConnectorSyncResult,
  IntegrationConnector,
  IntegrationHealth,
  IntegrationSyncContext,
  TranslationContext,
} from "../connector";
import type {NormalisedEventInput} from "@/types/events";
import {GitHubApi, GitHubApiError} from "./api";
import {githubActivityTranslator, githubWorkflowTranslator} from "./translator";
import type {GitHubActivity, GitHubWorkflowRun} from "./types";
import {trackedRepositories} from "./selection";

type GitHubRecord =
  {kind: "activity"; value: GitHubActivity} | {kind: "workflow"; value: GitHubWorkflowRun};

/** Bounds per sync so one large installation cannot exhaust the API budget. */
export const GITHUB_APP_LIMITS = {repositories: 20, workflowRepositories: 10} as const;

/**
 * GitHub connector backed by a GitHub App installation. It only ever sees the repositories the
 * user gave the app on GitHub and, of those, only the ones this organisation chose to track. It
 * stores no long-lived token: each sync mints a one-hour token.
 */
export class GitHubAppConnector implements IntegrationConnector<GitHubRecord> {
  provider = "github";
  private api?: Pick<GitHubApi, "installationRepositories" | "repositoryActivity" | "workflowRuns">;
  constructor(
    private getApi: () => Promise<
      Pick<GitHubApi, "installationRepositories" | "repositoryActivity" | "workflowRuns">
    >,
    /** Repositories this organisation tracks; undefined (older connections) means all of them. */
    private selection?: string[],
  ) {}
  private async client() {
    this.api ??= await this.getApi();
    return this.api;
  }
  async connect(): Promise<ConnectorOperationResult> {
    await (await this.client()).installationRepositories();
    return {ok: true};
  }
  async disconnect(): Promise<ConnectorOperationResult> {
    return {ok: true};
  }
  async refresh(): Promise<ConnectorOperationResult> {
    return {ok: true};
  }
  async healthCheck(): Promise<IntegrationHealth> {
    try {
      await (await this.client()).installationRepositories();
      return "healthy";
    } catch (error) {
      return error instanceof GitHubApiError && error.kind === "unauthorized" ? "expired" : "error";
    }
  }
  translate(record: GitHubRecord, context: TranslationContext) {
    return record.kind === "activity"
      ? githubActivityTranslator.translate(record.value, context)
      : githubWorkflowTranslator.translate(record.value, context);
  }
  async sync(context: IntegrationSyncContext): Promise<ConnectorSyncResult> {
    if (this.selection && !this.selection.length) return {received: 0, events: []};
    const api = await this.client(),
      repositories = trackedRepositories(
        await api.installationRepositories(),
        this.selection,
      ).slice(0, GITHUB_APP_LIMITS.repositories),
      activity: GitHubActivity[] = [];
    for (const repository of repositories) {
      try {
        activity.push(...(await api.repositoryActivity(repository)));
      } catch (error) {
        // One unreadable repository (e.g. just removed from the selection) should not stop the rest.
        if (error instanceof GitHubApiError && error.kind === "rate_limit") throw error;
      }
    }
    const workflows = await api.workflowRuns(
      repositories.slice(0, GITHUB_APP_LIMITS.workflowRepositories),
    );
    const translationContext = {
        ...context,
        receivedAt: context.receivedAt ?? new Date().toISOString(),
      },
      records: GitHubRecord[] = [
        ...activity.map((value) => ({kind: "activity" as const, value})),
        ...workflows.map((value) => ({kind: "workflow" as const, value})),
      ];
    const events = records
      .flatMap((record) => {
        const translated = this.translate(record, translationContext);
        return translated ? (Array.isArray(translated) ? translated : [translated]) : [];
      })
      .filter((event): event is NormalisedEventInput => Boolean(event));
    return {received: records.length, events};
  }
}
