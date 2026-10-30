import "server-only";
import {z} from "zod";
import type {AuthInfo, McpServer} from "@modelcontextprotocol/server";
import {userClient} from "./auth";
import {mcpContext, McpToolError, type McpContext} from "./context";
import {
  addTodo,
  getPerformance,
  INSIGHT_SEVERITIES,
  INSIGHT_STATUSES,
  listInsights,
  listPeople,
  listProjects,
  listTodos,
} from "./tools";

export const MCP_INSTRUCTIONS = `Metric Mage is a marketing and business dashboard. Each person belongs to one or more projects (organisations) and can only see their own.
Start with list_projects to get project IDs. Most tools take an optional project_id; leave it out to cover every project.
Figures come from the tools each project has connected (Stripe, Google Analytics, Meta, Mailchimp and so on), compared with the previous period.
add_todo changes data: always confirm the title, project, deadline and people with the user before calling it.`;

type ToolResult = {content: {type: "text"; text: string}[]; isError?: boolean};

/** Runs one tool call as the connected person and turns the result into MCP content. */
export async function runTool<T>(
  authInfo: AuthInfo | undefined,
  work: (ctx: McpContext) => Promise<T> | T,
  context = mcpContext,
): Promise<ToolResult> {
  try {
    const ctx = await context(authInfo, userClient);
    const result = await work(ctx);
    return {content: [{type: "text", text: JSON.stringify(result, null, 2)}]};
  } catch (error) {
    if (error instanceof McpToolError)
      return {content: [{type: "text", text: error.message}], isError: true};
    console.error("Metric Mage MCP tool failed", error);
    return {
      content: [
        {type: "text", text: "Metric Mage couldn't complete that just now. Try again shortly."},
      ],
      isError: true,
    };
  }
}

const projectId = z
  .uuid()
  .optional()
  .describe("A project ID from list_projects. Leave out to include all of your projects.");
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function registerMetricMageTools(server: McpServer) {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Lists the Metric Mage projects (organisations) you belong to, with your role in each. Use the IDs with the other tools.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async (_args, ctx) => runTool(ctx.http?.authInfo, listProjects),
  );

  server.registerTool(
    "list_people",
    {
      title: "List people in a project",
      description:
        "Lists the active team members of one project, with the user IDs used to assign to-dos.",
      inputSchema: z.object({project_id: z.uuid().describe("A project ID from list_projects.")}),
      annotations: readOnly,
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, (c) => listPeople(c, {projectId: args.project_id})),
  );

  server.registerTool(
    "get_performance",
    {
      title: "Get performance",
      description:
        "How a project is doing: key figures (revenue, orders, traffic, ad spend, email, reviews and more, depending on what's connected) with the percentage change against the previous period, plus highlights of what went well or needs a look and the likely reasons why.",
      inputSchema: z.object({
        project_id: projectId,
        period: z
          .enum(["week", "month", "year"])
          .default("week")
          .describe("The last 7, 30 or 365 days, compared with the same length before."),
        include_trends: z
          .boolean()
          .default(false)
          .describe("Also return day-by-day (weekly for a year) values for charts."),
      }),
      annotations: readOnly,
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, (c) =>
        getPerformance(c, {
          projectId: args.project_id,
          period: args.period,
          includeTrends: args.include_trends,
        }),
      ),
  );

  server.registerTool(
    "list_insights",
    {
      title: "List insights",
      description:
        "Insights Metric Mage has spotted in a project's data, each with an explanation, a recommendation, severity and confidence.",
      inputSchema: z.object({
        project_id: projectId,
        status: z
          .enum([...INSIGHT_STATUSES, "all"])
          .default("active")
          .describe("Active insights are the ones still needing attention."),
        severity: z.enum(INSIGHT_SEVERITIES).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: readOnly,
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, (c) =>
        listInsights(c, {
          projectId: args.project_id,
          status: args.status,
          severity: args.severity,
          limit: args.limit,
        }),
      ),
  );

  server.registerTool(
    "list_todos",
    {
      title: "List to-dos",
      description:
        "The shared to-do list: each to-do's status (not started, in progress, done), who it's assigned to, and its deadline, including whether it's overdue.",
      inputSchema: z.object({
        project_id: projectId,
        status: z
          .enum(["not_done", "open", "in_progress", "completed", "all"])
          .default("not_done")
          .describe("open = not started; not_done = not started or in progress."),
        assigned_to_me: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: readOnly,
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, (c) =>
        listTodos(c, {
          projectId: args.project_id,
          status: args.status,
          assignedToMe: args.assigned_to_me,
          limit: args.limit,
        }),
      ),
  );

  server.registerTool(
    "add_todo",
    {
      title: "Add a to-do",
      description:
        "Adds a to-do to a project's shared list, visible to the whole team. This changes data: before calling it, show the user the exact title, project, deadline and assignees and wait for them to confirm. Assigns it to the user unless assignee_ids are given (get them from list_people).",
      inputSchema: z.object({
        project_id: z.uuid().describe("A project ID from list_projects."),
        title: z.string().min(1).max(200),
        due_date: z.iso.date().optional().describe("Deadline day, YYYY-MM-DD."),
        assignee_ids: z.array(z.uuid()).max(20).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args, ctx) =>
      runTool(ctx.http?.authInfo, (c) =>
        addTodo(c, {
          projectId: args.project_id,
          title: args.title,
          dueDate: args.due_date,
          assigneeIds: args.assignee_ids,
        }),
      ),
  );
}
