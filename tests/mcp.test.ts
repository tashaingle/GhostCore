import {beforeEach, describe, expect, it, vi} from "vitest";
import type {SupabaseClient, User} from "@supabase/supabase-js";
import type {AuthInfo} from "@modelcontextprotocol/server";
import type {Database} from "@/types/database";

const mocks = vi.hoisted(() => ({
  createManualTodo: vi.fn(),
  loadPerformance: vi.fn(),
  loadPerformanceMany: vi.fn(),
}));

// Member names come from Auth with the service client; here they're a fixed list per project.
vi.mock("@/lib/organisations/people", async () => {
  const {peopleIndex} = await vi.importActual<typeof import("@/lib/organisations/people")>(
    "@/lib/organisations/people",
  );
  const members: Record<string, {userId: string; name: string}[]> = {
    "11111111-1111-4111-8111-111111111111": [
      {userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tash"},
      {userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Sam"},
    ],
    "22222222-2222-4222-8222-222222222222": [
      {userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Tash"},
    ],
  };
  const index = (id: string) =>
    peopleIndex(
      (members[id] ?? []).map((person) => ({...person, email: null, label: person.name})),
    );
  return {
    peopleIndex,
    organisationPeople: async (_client: unknown, id: string) => index(id),
    organisationsPeople: async (_client: unknown, ids: string[]) =>
      new Map(ids.map((id) => [id, index(id)])),
  };
});
vi.mock("@/lib/home/add-todo", async () => ({
  ...(await vi.importActual<typeof import("@/lib/home/add-todo")>("@/lib/home/add-todo")),
  createManualTodo: mocks.createManualTodo,
}));
vi.mock("@/lib/home/load-performance", () => ({
  loadPerformance: mocks.loadPerformance,
  loadPerformanceMany: mocks.loadPerformanceMany,
}));

import {jwtClaims, verifyMcpToken} from "@/lib/mcp/auth";
import {mcpContext, McpToolError, pickProjects, type McpContext} from "@/lib/mcp/context";
import {addTodo, getPerformance, listInsights, listProjects, listTodos} from "@/lib/mcp/tools";
import {runTool} from "@/lib/mcp/server";
import {isAuthorizationId, isClientRedirect} from "@/lib/mcp/consent";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const XUFU = "11111111-1111-4111-8111-111111111111";
const CARPRISE = "22222222-2222-4222-8222-222222222222";
const SOMEONE_ELSES = "33333333-3333-4333-8333-333333333333";

const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({alg: "ES256"})).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

type Row = Record<string, unknown>;
type Call = {table: string; method: string; args: unknown[]};

/** A stand-in for Supabase that applies eq/in/is filters and records every call. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string, apply?: (args: unknown[]) => void) =>
      (...args: unknown[]) => {
        calls.push({table, method, args});
        apply?.(args);
        return builder;
      };
    Object.assign(builder, {
      select: chain("select"),
      order: chain("order"),
      eq: chain(
        "eq",
        ([column, value]) => (rows = rows.filter((row) => row[column as string] === value)),
      ),
      in: chain("in", ([column, values]) => {
        rows = rows.filter((row) => (values as unknown[]).includes(row[column as string]));
      }),
      is: chain(
        "is",
        ([column, value]) =>
          (rows = rows.filter((row) => (row[column as string] ?? null) === value)),
      ),
      limit: chain("limit", ([count]) => (rows = rows.slice(0, count as number))),
      then: (resolve: (value: unknown) => unknown) => resolve({data: rows, error: null}),
    });
    return builder;
  };
  return {client: {from} as unknown as SupabaseClient<Database>, calls};
}

const organisation = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  logo_url: null,
  website: null,
  industry: null,
  timezone: "Europe/London",
  default_currency: "GBP",
});

const memberships = [
  {
    id: "m1",
    user_id: ME,
    organisation_id: XUFU,
    role: "owner",
    status: "active",
    created_at: "2026-01-01",
    organisations: organisation(XUFU, "Xufu"),
  },
  {
    id: "m2",
    user_id: ME,
    organisation_id: CARPRISE,
    role: "viewer",
    status: "active",
    created_at: "2026-02-01",
    organisations: organisation(CARPRISE, "Carprise"),
  },
  {
    id: "m3",
    user_id: ME,
    organisation_id: SOMEONE_ELSES,
    role: "owner",
    status: "removed",
    created_at: "2026-03-01",
    organisations: organisation(SOMEONE_ELSES, "Old job"),
  },
  {
    id: "m4",
    user_id: SAM,
    organisation_id: SOMEONE_ELSES,
    role: "owner",
    status: "active",
    created_at: "2026-03-01",
    organisations: organisation(SOMEONE_ELSES, "Sam's shop"),
  },
];

const authInfo = (userId = ME): AuthInfo => ({
  token: "token",
  clientId: "claude",
  scopes: [],
  extra: {userId, siteUrl: "https://app.metricmage.test"},
});

async function context(tables: Record<string, Row[]> = {}) {
  const fake = fakeSupabase({organisation_members: memberships, ...tables});
  const ctx = await mcpContext(authInfo(), () => fake.client);
  return {ctx, calls: fake.calls};
}

beforeEach(() => vi.clearAllMocks());

describe("Claude connector tokens", () => {
  const user = {id: ME, email: "tash@example.com"} as User;
  const accepted = async () => ({data: {user}, error: null});

  it("accepts a Supabase OAuth token issued to a client", async () => {
    const token = jwt({
      sub: ME,
      client_id: "claude-client",
      scope: "openid email",
      exp: 2_000_000_000,
    });
    const info = await verifyMcpToken(token, accepted);
    expect(info).toMatchObject({
      token,
      clientId: "claude-client",
      scopes: ["openid", "email"],
      expiresAt: 2_000_000_000,
      extra: {userId: ME, email: "tash@example.com"},
    });
  });

  it("refuses missing tokens and browser sessions without a client", async () => {
    const getUser = vi.fn(accepted);
    expect(await verifyMcpToken(undefined, getUser)).toBeUndefined();
    expect(await verifyMcpToken("not-a-jwt", getUser)).toBeUndefined();
    expect(await verifyMcpToken(jwt({sub: ME}), getUser)).toBeUndefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refuses tokens Supabase rejects, such as after disconnecting", async () => {
    const token = jwt({sub: ME, client_id: "claude-client"});
    const revoked = async () => ({data: {user: null}, error: new Error("session_not_found")});
    expect(await verifyMcpToken(token, revoked)).toBeUndefined();
  });

  it("refuses a token whose subject isn't the user Supabase returns", async () => {
    const token = jwt({sub: SAM, client_id: "claude-client"});
    expect(await verifyMcpToken(token, accepted)).toBeUndefined();
  });

  it("reads claims without trusting malformed payloads", () => {
    expect(jwtClaims(jwt({sub: ME}))).toEqual({sub: ME});
    expect(jwtClaims("a.!!!.c")).toBeNull();
    expect(jwtClaims("only-one-part")).toBeNull();
  });
});

describe("Claude connector scoping", () => {
  it("lists only the person's active memberships, queried as them", async () => {
    const {ctx, calls} = await context();
    expect(ctx.projects.map((project) => project.id)).toEqual([XUFU, CARPRISE]);
    expect(calls).toContainEqual({
      table: "organisation_members",
      method: "eq",
      args: ["user_id", ME],
    });
    expect(calls).toContainEqual({
      table: "organisation_members",
      method: "eq",
      args: ["status", "active"],
    });
    expect(listProjects(ctx).projects).toEqual([
      expect.objectContaining({id: XUFU, name: "Xufu", your_role: "Owner", can_add_todos: true}),
      expect.objectContaining({id: CARPRISE, name: "Carprise", can_add_todos: false}),
    ]);
  });

  it("needs a signed-in user", async () => {
    await expect(mcpContext(undefined, () => fakeSupabase({}).client)).rejects.toBeInstanceOf(
      McpToolError,
    );
  });

  it("refuses projects the person isn't in", async () => {
    const {ctx} = await context();
    expect(() => pickProjects(ctx, SOMEONE_ELSES)).toThrow(/isn't one of yours/);
    expect(pickProjects(ctx, XUFU).map((project) => project.id)).toEqual([XUFU]);
    expect(pickProjects(ctx, undefined).map((project) => project.id)).toEqual([XUFU, CARPRISE]);
  });

  it("checks role permissions for the chosen project", async () => {
    const {ctx} = await context();
    expect(() => pickProjects(ctx, CARPRISE, "work.create")).toThrow(/role in Carprise/);
    expect(pickProjects(ctx, undefined, "work.create").map((project) => project.id)).toEqual([
      XUFU,
    ]);
  });

  it("returns tool errors to Claude as messages and hides unexpected ones", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = async () => {
      throw new McpToolError("You can't add to this list.");
    };
    expect(await runTool(authInfo(), failing, async () => ({}) as McpContext)).toEqual({
      content: [{type: "text", text: "You can't add to this list."}],
      isError: true,
    });
    const broken = await runTool(
      authInfo(),
      () => {
        throw new Error("relation insights: permission denied");
      },
      async () => ({}) as McpContext,
    );
    expect(broken.isError).toBe(true);
    expect(broken.content[0].text).not.toMatch(/relation|permission/);
    expect(
      await runTool(
        authInfo(),
        () => ({ok: true}),
        async () => ({}) as McpContext,
      ),
    ).toEqual({
      content: [{type: "text", text: JSON.stringify({ok: true}, null, 2)}],
    });
    quiet.mockRestore();
  });
});

describe("Claude connector tools", () => {
  const insights = [
    {
      id: "i1",
      organisation_id: XUFU,
      title: "Revenue dipped",
      summary: "Down 20%",
      severity: "warning",
      confidence: 0.8,
      status: "active",
      explanation: "Fewer orders",
      recommendation: "Check ads",
      created_at: "2026-10-20",
      updated_at: "2026-10-29",
    },
    {
      id: "i2",
      organisation_id: SOMEONE_ELSES,
      title: "Not yours",
      summary: "",
      severity: "info",
      confidence: 1,
      status: "active",
      explanation: "",
      recommendation: "",
      created_at: "2026-10-20",
      updated_at: "2026-10-29",
    },
    {
      id: "i3",
      organisation_id: CARPRISE,
      title: "Resolved thing",
      summary: "",
      severity: "good",
      confidence: 1,
      status: "resolved",
      explanation: "",
      recommendation: "",
      created_at: "2026-10-20",
      updated_at: "2026-10-28",
    },
  ];

  it("lists insights only from the person's projects", async () => {
    const {ctx, calls} = await context({insights});
    const result = await listInsights(ctx, {status: "all", limit: 25});
    expect(result.insights.map((insight) => insight.id)).toEqual(["i1", "i3"]);
    expect(calls).toContainEqual({
      table: "insights",
      method: "in",
      args: ["organisation_id", [XUFU, CARPRISE]],
    });
    expect(result.insights[0]).toMatchObject({
      project: {id: XUFU, name: "Xufu"},
      recommendation: "Check ads",
      link: "https://app.metricmage.test/app/insights/i1",
    });
    const active = await listInsights(ctx, {
      projectId: XUFU,
      status: "active",
      severity: "warning",
      limit: 5,
    });
    expect(active.insights.map((insight) => insight.id)).toEqual(["i1"]);
    await expect(
      listInsights(ctx, {projectId: SOMEONE_ELSES, status: "all", limit: 5}),
    ).rejects.toThrow(McpToolError);
  });

  const tasks = [
    {
      id: "t1",
      organisation_id: XUFU,
      title: "Send invoices",
      status: "open",
      source_type: "manual",
      assigned_user_id: ME,
      created_at: "2026-10-29T09:00:00Z",
      due_at: "2026-10-28T12:00:00.000Z",
    },
    {
      id: "t2",
      organisation_id: XUFU,
      title: "Plan launch",
      status: "blocked",
      source_type: "manual",
      assigned_user_id: SAM,
      created_at: "2026-10-28T09:00:00Z",
      due_at: null,
    },
    {
      id: "t3",
      organisation_id: CARPRISE,
      title: "Shipped",
      status: "completed",
      source_type: "manual",
      assigned_user_id: ME,
      created_at: "2026-10-27T09:00:00Z",
      due_at: "2026-10-20T12:00:00.000Z",
    },
    {
      id: "t4",
      organisation_id: XUFU,
      title: "Automatic",
      status: "open",
      source_type: "insight",
      assigned_user_id: ME,
      created_at: "2026-10-26T09:00:00Z",
      due_at: null,
    },
    {
      id: "t5",
      organisation_id: SOMEONE_ELSES,
      title: "Sam's secret",
      status: "open",
      source_type: "manual",
      assigned_user_id: SAM,
      created_at: "2026-10-26T09:00:00Z",
      due_at: null,
    },
  ];
  const work_assignments = [
    {task_id: "t2", organisation_id: XUFU, assigned_user_id: SAM, unassigned_at: null},
    {task_id: "t2", organisation_id: XUFU, assigned_user_id: ME, unassigned_at: null},
    {task_id: "t1", organisation_id: XUFU, assigned_user_id: SAM, unassigned_at: "2026-10-29"},
  ];

  it("lists manual to-dos with status, people and deadlines", async () => {
    const {ctx} = await context({work_tasks: tasks, work_assignments});
    const now = new Date("2026-10-30T10:00:00Z");
    const all = await listTodos(ctx, {status: "all", assignedToMe: false, limit: 50}, now);
    expect(all.todos.map((todo) => todo.id)).toEqual(["t1", "t2", "t3"]);
    expect(all.todos[0]).toMatchObject({
      status: "open",
      status_label: "Not started",
      project: {id: XUFU, name: "Xufu"},
      assignees: [{user_id: ME, name: "Tash"}],
      due_date: "2026-10-28",
      due_label: "Overdue · Wed 28 Oct",
      overdue: true,
    });
    expect(all.todos[1]).toMatchObject({
      status: "in_progress",
      assignees: [
        {user_id: SAM, name: "Sam"},
        {user_id: ME, name: "Tash"},
      ],
      due_date: null,
      overdue: false,
    });
    expect(all.counts).toEqual({not_started: 1, in_progress: 1, done: 1, overdue: 1});
    expect(all.link).toBe("https://app.metricmage.test/app/todo");

    const notDone = await listTodos(ctx, {status: "not_done", assignedToMe: false, limit: 50}, now);
    expect(notDone.todos.map((todo) => todo.id)).toEqual(["t1", "t2"]);
    const mine = await listTodos(
      ctx,
      {projectId: CARPRISE, status: "all", assignedToMe: true, limit: 50},
      now,
    );
    expect(mine.todos.map((todo) => todo.id)).toEqual(["t3"]);
  });

  it("loads performance as the person for the chosen project", async () => {
    const {ctx} = await context();
    mocks.loadPerformance.mockResolvedValue({
      metrics: [
        {
          key: "revenue",
          group: "Money",
          label: "Revenue",
          value: "£1,200",
          change: -20,
          source: "Stripe",
          higherIsBetter: true,
          comparable: true,
          trend: {
            current: [1],
            previous: [2],
            starts: [Date.UTC(2026, 9, 24)],
            bucketDays: 1,
            unit: {kind: "count"},
          },
        },
      ],
      highlights: [
        {
          tone: "bad",
          text: "Revenue is down 20%",
          key: "revenue",
          why: "Fewer orders",
          action: {label: "Open", href: "/app/insights"},
        },
      ],
      updates: 4,
    });
    const result = await getPerformance(ctx, {
      projectId: XUFU,
      period: "month",
      includeTrends: false,
    });
    expect(mocks.loadPerformance).toHaveBeenCalledWith(
      ctx.supabase,
      XUFU,
      "month",
      expect.any(Date),
    );
    expect(result).toMatchObject({
      compared: "this month compared with last month",
      project: {id: XUFU, name: "Xufu"},
      metrics: [{key: "revenue", value: "£1,200", change_percent: -20}],
      highlights: [
        {tone: "bad", why: "Fewer orders", link: "https://app.metricmage.test/app/insights"},
      ],
    });
    expect("trend" in (result as {metrics: object[]}).metrics[0]).toBe(false);
    const withTrend = await getPerformance(ctx, {
      projectId: XUFU,
      period: "week",
      includeTrends: true,
    });
    expect((withTrend as {metrics: {trend?: unknown}[]}).metrics[0].trend).toEqual({
      bucket_days: 1,
      starts: ["2026-10-24"],
      current: [1],
      previous: [2],
    });
  });

  it("summarises every project at once when none is chosen", async () => {
    const {ctx} = await context();
    mocks.loadPerformanceMany.mockResolvedValue(
      new Map([[XUFU, {metrics: [], highlights: [], updates: 0}]]),
    );
    const result = await getPerformance(ctx, {period: "week", includeTrends: false});
    expect(mocks.loadPerformanceMany).toHaveBeenCalledWith(
      ctx.supabase,
      [XUFU, CARPRISE],
      "week",
      expect.any(Date),
    );
    expect((result as {projects: unknown[]}).projects).toHaveLength(2);
  });

  it("adds a to-do with the same checks as the app", async () => {
    const {ctx} = await context();
    mocks.createManualTodo.mockResolvedValue({id: "new", title: "Call the printer"});
    const result = await addTodo(ctx, {
      projectId: XUFU,
      title: "  Call the printer ",
      dueDate: "2026-11-06",
    });
    expect(mocks.createManualTodo).toHaveBeenCalledWith({
      organisationId: XUFU,
      userId: ME,
      title: "Call the printer",
      dueAt: "2026-11-06T12:00:00.000Z",
      assigneeIds: [ME],
    });
    expect(result.added).toMatchObject({id: "new", due_date: "2026-11-06", assignee_ids: [ME]});

    await addTodo(ctx, {projectId: XUFU, title: "Brief Sam", assigneeIds: [SAM, ME]});
    expect(mocks.createManualTodo).toHaveBeenLastCalledWith(
      expect.objectContaining({assigneeIds: [SAM, ME], dueAt: null}),
    );
  });

  it("refuses to-dos that the app would refuse", async () => {
    const {ctx} = await context();
    await expect(addTodo(ctx, {projectId: XUFU, title: "   "})).rejects.toThrow(/short to do/);
    await expect(addTodo(ctx, {projectId: XUFU, title: "x".repeat(201)})).rejects.toThrow(
      /short to do/,
    );
    await expect(
      addTodo(ctx, {projectId: XUFU, title: "Ok", dueDate: "2026-13-40"}),
    ).rejects.toThrow(/valid deadline/);
    await expect(addTodo(ctx, {projectId: SOMEONE_ELSES, title: "Ok"})).rejects.toThrow(
      /one of your projects/,
    );
    await expect(addTodo(ctx, {projectId: CARPRISE, title: "Ok"})).rejects.toThrow(/can't add/);
    await expect(
      addTodo(ctx, {
        projectId: XUFU,
        title: "Ok",
        assigneeIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      }),
    ).rejects.toThrow(/people from this project/);
    expect(mocks.createManualTodo).not.toHaveBeenCalled();
  });
});

describe("Claude consent page", () => {
  it("accepts only well-formed authorisation IDs", () => {
    expect(isAuthorizationId("a1b2c3d4-e5f6")).toBe(true);
    expect(isAuthorizationId("abc")).toBe(false);
    expect(isAuthorizationId("abcdefgh&next=/x")).toBe(false);
    expect(isAuthorizationId(undefined)).toBe(false);
  });

  it("only follows web redirects back to the client", () => {
    expect(isClientRedirect("https://claude.ai/api/mcp/auth_callback?code=x")).toBe(true);
    expect(isClientRedirect("http://localhost:33418/callback?code=x")).toBe(true);
    expect(isClientRedirect("javascript:alert(1)")).toBe(false);
    expect(isClientRedirect("/relative")).toBe(false);
  });
});
