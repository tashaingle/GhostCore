import type {SupabaseClient} from "@supabase/supabase-js";
import type {AuthInfo} from "@modelcontextprotocol/server";
import type {Database} from "@/types/database";
import {hasPermission, type OrganisationRole, type Permission} from "@/lib/auth/permissions";
import {sortProjects} from "@/lib/home/projects";
import {activeMemberships} from "./memberships";

/** A message Claude can show the person as-is. Anything else becomes a generic error. */
export class McpToolError extends Error {}

export type McpProject = {
  id: string;
  name: string;
  slug: string;
  role: OrganisationRole;
  timezone: string;
  currency: string;
};

export type McpContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  siteUrl: string;
  projects: McpProject[];
};

/**
 * Everything a tool call may touch: a client signed in as the person who connected Claude, and
 * the projects they're an active member of. Nothing outside `projects` is ever queried.
 */
export async function mcpContext(
  authInfo: AuthInfo | undefined,
  makeClient: (token: string) => SupabaseClient<Database>,
): Promise<McpContext> {
  const userId = authInfo?.extra?.userId;
  if (!authInfo || typeof userId !== "string")
    throw new McpToolError("Reconnect Metric Mage in Claude to carry on.");
  const supabase = makeClient(authInfo.token);
  const working = await activeMemberships(supabase, userId);
  const siteUrl = typeof authInfo.extra?.siteUrl === "string" ? authInfo.extra.siteUrl : "";
  return {
    supabase,
    userId,
    siteUrl,
    projects: sortProjects(
      working.map(({membership, organisation}) => ({
        id: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        role: membership.role as OrganisationRole,
        timezone: organisation.timezone,
        currency: organisation.default_currency,
      })),
    ),
  };
}

/**
 * The projects a tool call covers: the one asked for, or all of them. A project the person isn't
 * in (or can't do this in) is refused rather than silently skipped.
 */
export function pickProjects(
  ctx: McpContext,
  projectId: string | undefined,
  permission: Permission = "workspace.read",
) {
  if (!ctx.projects.length) throw new McpToolError("You're not in any Metric Mage projects yet.");
  if (projectId) {
    const project = ctx.projects.find((item) => item.id === projectId);
    if (!project)
      throw new McpToolError(
        "That project isn't one of yours. Use list_projects to see the ones you can use.",
      );
    if (!hasPermission(project.role, permission))
      throw new McpToolError(`Your role in ${project.name} doesn't allow this.`);
    return [project];
  }
  const allowed = ctx.projects.filter((project) => hasPermission(project.role, permission));
  if (!allowed.length) throw new McpToolError("Your roles don't allow this in any project.");
  return allowed;
}

export const appLink = (ctx: McpContext, path: string) =>
  ctx.siteUrl ? `${ctx.siteUrl}${path}` : path;
