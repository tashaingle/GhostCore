import "server-only";
import {z} from "zod";
import {VERCEL_LIMITS} from "./config";
import type {VercelDeployment, VercelProject} from "./types";

export type VercelErrorKind =
  "unauthorized" | "permission" | "rate_limit" | "configuration" | "unavailable" | "malformed";

export class VercelError extends Error {
  constructor(
    public kind: VercelErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const projectSchema = z.object({
    id: z.string(),
    name: z.string(),
    framework: z.string().nullable().optional(),
  }),
  projectsSchema = z.object({projects: z.array(projectSchema).default([])}),
  deploymentSchema = z.object({
    uid: z.string(),
    name: z.string().optional(),
    url: z.string().optional(),
    created: z.number(),
    state: z.string().optional(),
    readyState: z.string().optional(),
    target: z.string().nullable().optional(),
    projectId: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  deploymentsSchema = z.object({deployments: z.array(deploymentSchema).default([])}),
  userSchema = z.object({
    user: z
      .object({
        username: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
      })
      .optional(),
  }),
  teamSchema = z.object({name: z.string().nullable().optional()});

function branchOf(meta: Record<string, unknown> | null | undefined) {
  const ref = meta?.githubCommitRef;
  return typeof ref === "string" && /^[\w./-]{1,100}$/.test(ref) ? ref : undefined;
}

function hostOf(url: string | undefined) {
  if (!url || !/^[a-z0-9.-]+$/i.test(url)) return undefined;
  return url;
}

export class VercelClient {
  constructor(
    private token: string,
    private request: typeof fetch = fetch,
  ) {}

  private async get<T>(
    path: string,
    query: Record<string, string | undefined>,
    schema: z.ZodType<T>,
  ) {
    const url = new URL(path, "https://api.vercel.com");
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {Authorization: `Bearer ${this.token}`, Accept: "application/json"},
        signal: AbortSignal.timeout(VERCEL_LIMITS.timeoutMs),
      });
    } catch {
      throw new VercelError("unavailable", "Vercel could not be reached. Try again shortly.");
    }
    const body = await response.json().catch(() => null);
    if (response.status === 401)
      throw new VercelError(
        "unauthorized",
        "Vercel authorization has expired. Reconnect Vercel.",
        401,
      );
    const code =
      body && typeof body === "object" && "error" in body
        ? String((body as {error?: {code?: string}}).error?.code ?? "")
        : "";
    if (response.status === 403 && code === "integration_configuration_disabled")
      throw new VercelError("unauthorized", "Vercel access was removed. Reconnect Vercel.", 403);
    if (response.status === 403)
      throw new VercelError("permission", "Vercel denied access to this account.", 403);
    if (response.status === 429)
      throw new VercelError(
        "rate_limit",
        "Vercel is rate limiting requests. Sync will retry.",
        429,
      );
    const parsed = schema.safeParse(body);
    if (!response.ok || !parsed.success)
      throw new VercelError(
        "unavailable",
        "Vercel could not be reached. Try again shortly.",
        response.status,
      );
    return parsed.data;
  }

  async projects(
    teamId?: string | null,
    limit: number = VERCEL_LIMITS.projects,
  ): Promise<VercelProject[]> {
    const data = await this.get(
      "/v9/projects",
      {limit: String(limit), teamId: teamId || undefined},
      projectsSchema,
    );
    return data.projects.map((project) => ({
      id: project.id,
      name: project.name,
      framework: project.framework,
    }));
  }

  async deployments(
    teamId: string | null | undefined,
    projectId: string,
  ): Promise<VercelDeployment[]> {
    const data = await this.get(
      "/v6/deployments",
      {projectId, limit: String(VERCEL_LIMITS.deployments), teamId: teamId || undefined},
      deploymentsSchema,
    );
    return data.deployments.map((deployment) => ({
      id: deployment.uid,
      projectId: deployment.projectId || projectId,
      projectName: deployment.name || projectId,
      url: hostOf(deployment.url),
      createdMs: deployment.created < 1e12 ? deployment.created * 1000 : deployment.created,
      state: (deployment.readyState || deployment.state || "").toUpperCase(),
      target: deployment.target ?? null,
      branch: branchOf(deployment.meta ?? undefined),
    }));
  }

  /** A display name for the connected account. Missing user or team scope falls back to "Vercel". */
  async accountName(teamId?: string | null) {
    if (teamId) {
      try {
        const team = await this.get(`/v2/teams/${encodeURIComponent(teamId)}`, {}, teamSchema);
        if (team.name) return team.name;
      } catch (error) {
        if (error instanceof VercelError && error.kind === "unauthorized") throw error;
      }
    }
    try {
      const user = await this.get("/v2/user", {}, userSchema);
      return user.user?.name || user.user?.username || "Vercel";
    } catch (error) {
      if (error instanceof VercelError && error.kind === "unauthorized") throw error;
      return "Vercel";
    }
  }
}
