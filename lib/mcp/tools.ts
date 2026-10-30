import "server-only";
import {roleLabel} from "@/lib/ui/labels";
import {loadPerformance, loadPerformanceMany} from "@/lib/home/load-performance";
import {PERIOD_LABEL, type Highlight, type Metric, type Period} from "@/lib/home/performance";
import {
  assigneeIds,
  dayFromDueAt,
  dueLabel,
  todayKey,
  TODO_CHOICES,
  todoChoice,
  type TodoChoice,
} from "@/lib/home/todo";
import {
  canAddTodo,
  createManualTodo,
  todoAssignees,
  todoDueAt,
  todoTitle,
} from "@/lib/home/add-todo";
import {organisationPeople, organisationsPeople} from "@/lib/organisations/people";
import {appLink, McpToolError, pickProjects, type McpContext, type McpProject} from "./context";

/** The read and write operations behind each Claude tool. Every query is limited to the
 * projects `pickProjects` returns and runs as the signed-in person. */

const projectSummary = (project: McpProject) => ({id: project.id, name: project.name});

export function listProjects(ctx: McpContext) {
  return {
    projects: ctx.projects.map((project) => ({
      id: project.id,
      name: project.name,
      your_role: roleLabel(project.role),
      timezone: project.timezone,
      currency: project.currency,
      can_add_todos: canAddTodo(project.role),
    })),
  };
}

export async function listPeople(ctx: McpContext, input: {projectId: string}) {
  const [project] = pickProjects(ctx, input.projectId);
  const people = await organisationPeople(ctx.supabase, project.id, ctx.userId);
  return {
    project: projectSummary(project),
    people: people.list.map((person) => ({
      user_id: person.userId,
      name: person.label,
    })),
  };
}

function metricOutput(metric: Metric, includeTrend: boolean) {
  return {
    key: metric.key,
    group: metric.group,
    label: metric.label,
    value: metric.value,
    change_percent: metric.change,
    source: metric.source,
    higher_is_better: metric.higherIsBetter,
    comparable: metric.comparable,
    ...(includeTrend && metric.trend
      ? {
          trend: {
            bucket_days: metric.trend.bucketDays,
            starts: metric.trend.starts.map((start) => new Date(start).toISOString().slice(0, 10)),
            current: metric.trend.current,
            previous: metric.trend.previous,
          },
        }
      : {}),
  };
}

function highlightOutput(ctx: McpContext, highlight: Highlight) {
  return {
    tone: highlight.tone,
    text: highlight.text,
    metric_key: highlight.key ?? null,
    why: highlight.why ?? null,
    tip: highlight.tip ?? null,
    link: highlight.action ? appLink(ctx, highlight.action.href) : null,
  };
}

export async function getPerformance(
  ctx: McpContext,
  input: {projectId?: string; period: Period; includeTrends: boolean},
  now = new Date(),
) {
  const projects = pickProjects(ctx, input.projectId);
  const compared = `${PERIOD_LABEL[input.period].current} compared with ${PERIOD_LABEL[input.period].previous}`;
  if (projects.length === 1) {
    const [project] = projects;
    const result = await loadPerformance(ctx.supabase, project.id, input.period, now);
    return {
      period: input.period,
      compared,
      project: projectSummary(project),
      metrics: result.metrics.map((metric) => metricOutput(metric, input.includeTrends)),
      highlights: result.highlights.map((highlight) => highlightOutput(ctx, highlight)),
      updates_from_connected_tools: result.updates,
    };
  }
  const results = await loadPerformanceMany(
    ctx.supabase,
    projects.map((project) => project.id),
    input.period,
    now,
  );
  return {
    period: input.period,
    compared,
    projects: projects.map((project) => {
      const result = results.get(project.id);
      return {
        project: projectSummary(project),
        metrics: (result?.metrics ?? []).map((metric) => metricOutput(metric, input.includeTrends)),
        highlights: (result?.highlights ?? []).map((highlight) => highlightOutput(ctx, highlight)),
      };
    }),
  };
}

export const INSIGHT_STATUSES = ["active", "acknowledged", "dismissed", "resolved"] as const;
export const INSIGHT_SEVERITIES = ["info", "good", "warning", "critical"] as const;

export async function listInsights(
  ctx: McpContext,
  input: {
    projectId?: string;
    status: (typeof INSIGHT_STATUSES)[number] | "all";
    severity?: (typeof INSIGHT_SEVERITIES)[number];
    limit: number;
  },
) {
  const projects = pickProjects(ctx, input.projectId);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  let query = ctx.supabase
    .from("insights")
    .select(
      "id,organisation_id,title,summary,severity,confidence,status,explanation,recommendation,created_at,updated_at",
    )
    .in("organisation_id", [...names.keys()])
    .order("updated_at", {ascending: false})
    .limit(input.limit);
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.severity) query = query.eq("severity", input.severity);
  const {data, error} = await query;
  if (error) throw new Error(`Insights query failed: ${error.message}`);
  return {
    insights: (data ?? []).map((insight) => ({
      id: insight.id,
      project: {id: insight.organisation_id, name: names.get(insight.organisation_id) ?? ""},
      title: insight.title,
      summary: insight.summary,
      severity: insight.severity,
      confidence: insight.confidence,
      status: insight.status,
      explanation: insight.explanation,
      recommendation: insight.recommendation,
      first_seen: insight.created_at,
      updated: insight.updated_at,
      link: appLink(ctx, `/app/insights/${insight.id}`),
    })),
  };
}

/** The work statuses behind each of the three to-do list choices. */
const TODO_STATUSES: Record<TodoChoice, string[]> = {
  open: ["backlog", "open", "waiting"],
  in_progress: ["in_progress", "blocked"],
  completed: ["completed"],
};

export async function listTodos(
  ctx: McpContext,
  input: {
    projectId?: string;
    status: TodoChoice | "not_done" | "all";
    assignedToMe: boolean;
    limit: number;
  },
  now = new Date(),
) {
  const projects = pickProjects(ctx, input.projectId, "work.view");
  const ids = projects.map((project) => project.id);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const statuses =
    input.status === "all"
      ? Object.values(TODO_STATUSES).flat()
      : input.status === "not_done"
        ? [...TODO_STATUSES.open, ...TODO_STATUSES.in_progress]
        : TODO_STATUSES[input.status];
  const {data: tasks, error} = await ctx.supabase
    .from("work_tasks")
    .select("id,title,status,assigned_user_id,organisation_id,created_at,due_at")
    .in("organisation_id", ids)
    .eq("source_type", "manual")
    .in("status", statuses)
    .order("created_at", {ascending: false})
    .limit(100);
  if (error) throw new Error(`To-do query failed: ${error.message}`);
  const taskIds = (tasks ?? []).map((task) => task.id);
  const [{data: assignments}, people] = await Promise.all([
    taskIds.length
      ? ctx.supabase
          .from("work_assignments")
          .select("task_id, assigned_user_id")
          .in("organisation_id", ids)
          .in("task_id", taskIds)
          .is("unassigned_at", null)
      : Promise.resolve({data: []}),
    organisationsPeople(ctx.supabase, ids, ctx.userId),
  ]);
  const today = todayKey(now);
  const todos = (tasks ?? [])
    .map((task) => {
      const chosen = assigneeIds(task.id, task.assigned_user_id, assignments ?? []);
      const lookup = people.get(task.organisation_id);
      const choice = todoChoice(task.status);
      const due = task.due_at ? dueLabel(task.due_at, task.status, today) : null;
      return {
        id: task.id,
        title: task.title,
        status: choice,
        status_label: TODO_CHOICES.find((item) => item.value === choice)?.label ?? choice,
        project: {id: task.organisation_id, name: names.get(task.organisation_id) ?? ""},
        assignees: chosen.map((userId) => ({
          user_id: userId,
          name: lookup?.name(userId) ?? "Team member",
        })),
        due_date: task.due_at ? dayFromDueAt(task.due_at) : null,
        due_label: due?.text ?? null,
        overdue: due?.tone === "overdue",
        added: task.created_at,
      };
    })
    .filter((todo) => !input.assignedToMe || todo.assignees.some((a) => a.user_id === ctx.userId))
    .slice(0, input.limit);
  return {
    today,
    counts: {
      not_started: todos.filter((todo) => todo.status === "open").length,
      in_progress: todos.filter((todo) => todo.status === "in_progress").length,
      done: todos.filter((todo) => todo.status === "completed").length,
      overdue: todos.filter((todo) => todo.overdue).length,
    },
    todos,
    link: appLink(ctx, "/app/todo"),
  };
}

export async function addTodo(
  ctx: McpContext,
  input: {projectId: string; title: string; dueDate?: string; assigneeIds?: string[]},
) {
  const title = todoTitle.safeParse(input.title);
  if (!title.success) throw new McpToolError("Write a short to do first (up to 200 characters).");
  const dueAt = todoDueAt(input.dueDate);
  if (dueAt === undefined) throw new McpToolError("Pick a valid deadline (YYYY-MM-DD).");
  const project = ctx.projects.find((item) => item.id === input.projectId);
  if (!project) throw new McpToolError("Pick one of your projects.");
  if (!canAddTodo(project.role)) throw new McpToolError("You can't add to this list.");
  const chosen = await todoAssignees(
    ctx.supabase,
    project.id,
    input.assigneeIds?.length ? input.assigneeIds : [ctx.userId],
  );
  if ("error" in chosen) throw new McpToolError(chosen.error);
  let created;
  try {
    created = await createManualTodo({
      organisationId: project.id,
      userId: ctx.userId,
      title: title.data,
      dueAt,
      assigneeIds: chosen.ids,
    });
  } catch (error) {
    throw new McpToolError(error instanceof Error ? error.message : "That couldn't be added.");
  }
  return {
    added: {
      id: created.id,
      title: created.title,
      project: projectSummary(project),
      due_date: dueAt ? dayFromDueAt(dueAt) : null,
      assignee_ids: chosen.ids,
    },
    link: appLink(ctx, "/app/todo"),
  };
}
