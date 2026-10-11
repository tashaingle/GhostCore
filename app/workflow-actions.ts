"use server";

import {z} from "zod";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {createServiceClient} from "@/lib/supabase/service";
import {
  createWorkflowDefinition,
  createWorkflowVersion,
  dispatchWorkflowRun,
  startWorkflow,
} from "@/lib/workflows/engine";
import {workflowSchema} from "@/lib/workflows/schema";
import {getWorkflowTemplate} from "@/lib/workflows/templates";
import {decideApproval, completeAssignment} from "@/lib/workflows/approvals";

const id = z.string().uuid();

function isNextControlFlow(error: unknown): error is {digest: string} {
  return (
    error !== null &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as {digest?: unknown}).digest === "string"
  );
}

function back(path: string, message: string, error = false): never {
  for (const p of [
    "/app/workflows",
    "/app/workflow-runs",
    "/app/approvals",
    "/app/command-centre",
  ]) {
    revalidatePath(p);
  }
  redirect(`${path}?${error ? "error" : "success"}=${encodeURIComponent(message)}`);
}

function parse(form: FormData) {
  let steps: unknown;
  try {
    steps = JSON.parse(String(form.get("steps") ?? "[]"));
  } catch {
    throw new Error("Step configuration is invalid JSON.");
  }
  return workflowSchema.parse({
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    triggerType: String(form.get("triggerType") ?? ""),
    steps,
  });
}

export async function saveWorkflow(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "workflows.manage")) {
    return back("/app/workflows", "Only owners and admins can change automations.", true);
  }
  try {
    const input = parse(form);
    const workflowId = String(form.get("workflowId") ?? "");
    const service = createServiceClient();
    const result = workflowId
      ? await createWorkflowVersion(
          service,
          ctx.organisation.id,
          ctx.user.id,
          id.parse(workflowId),
          input,
          String(form.get("reason") || "Steps updated."),
        )
      : await createWorkflowDefinition(service, ctx.organisation.id, ctx.user.id, input);
    return back(`/app/workflows/${workflowId || result.id}`, "Automation saved.");
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      "/app/workflows/new",
      error instanceof Error ? error.message : "The automation couldn't be saved.",
      true,
    );
  }
}

export async function createFromTemplate(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "workflows.manage")) {
    return back("/app/workflows", "Only owners and admins can change automations.", true);
  }
  const template = getWorkflowTemplate(String(form.get("templateKey") ?? ""));
  if (!template) return back("/app/workflows", "Template was not found.", true);
  try {
    const workflow = await createWorkflowDefinition(
      createServiceClient(),
      ctx.organisation.id,
      ctx.user.id,
      template.definition,
      `Created from template ${template.key}.`,
    );
    return back(
      `/app/workflows/${workflow.id}`,
      "Added from the template. It's off for now: check the steps below, then switch it on.",
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      "/app/workflows",
      error instanceof Error ? error.message : "Template could not be applied.",
      true,
    );
  }
}

export async function workflowDefinitionAction(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "workflows.manage")) {
    return back("/app/workflows", "Only owners and admins can change automations.", true);
  }
  const workflowId = id.safeParse(String(form.get("id") ?? ""));
  const action = String(form.get("action") ?? "");
  if (!workflowId.success || !["enable", "disable", "archive"].includes(action)) {
    return back("/app/workflows", "Something went wrong. Please try again.", true);
  }
  const values =
    action === "enable"
      ? {enabled: true, status: "active"}
      : action === "disable"
        ? {enabled: false, status: "disabled"}
        : {enabled: false, status: "archived"};
  const {error} = await createServiceClient()
    .from("workflow_definitions")
    .update({...values, updated_at: new Date().toISOString()})
    .eq("id", workflowId.data)
    .eq("organisation_id", ctx.organisation.id);
  return back(
    `/app/workflows/${workflowId.data}`,
    error
      ? "The automation couldn't be updated."
      : ({enable: "Automation switched on.", disable: "Automation switched off."}[action] ??
          "Automation archived."),
    Boolean(error),
  );
}

export async function runWorkflow(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "workflow.run")) {
    return back("/app/workflows", "You don't have permission to run automations.", true);
  }
  const workflowId = id.safeParse(String(form.get("id") ?? ""));
  if (!workflowId.success) return back("/app/workflows", "Invalid workflow.", true);
  try {
    const nonce = String(form.get("executionKey") ?? crypto.randomUUID());
    const result = await startWorkflow(createServiceClient(), {
      organisationId: ctx.organisation.id,
      workflowId: workflowId.data,
      triggerType: "manual",
      sourceId: `manual:${ctx.user.id}:${nonce}`,
      payload: {requestedBy: ctx.user.id},
      userId: ctx.user.id,
    });
    return back(
      `/app/workflow-runs/${result.runId}`,
      result.duplicate ? "This has already run." : "Automation started.",
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      `/app/workflows/${workflowId.data}`,
      error instanceof Error ? error.message : "The automation couldn't start.",
      true,
    );
  }
}

export async function workflowRunAction(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  const runId = id.safeParse(String(form.get("id") ?? ""));
  const action = String(form.get("action") ?? "");
  if (!runId.success) return back("/app/workflow-runs", "Invalid workflow run.", true);
  const permission =
    action === "retry"
      ? "workflow.retry"
      : action === "cancel"
        ? "workflow.cancel"
        : "workflow.run";
  if (!hasPermission(role, permission)) {
    return back(`/app/workflow-runs/${runId.data}`, "You cannot perform this run action.", true);
  }
  const service = createServiceClient();
  const {data: run} = await service
    .from("workflow_runs")
    .select("*")
    .eq("id", runId.data)
    .eq("organisation_id", ctx.organisation.id)
    .maybeSingle();
  if (!run) return back("/app/workflow-runs", "That run wasn't found.", true);
  const now = new Date().toISOString();
  if (action === "cancel") {
    await service
      .from("workflow_runs")
      .update({status: "cancelled", finished_at: now, updated_at: now})
      .eq("id", run.id);
  } else if (action === "pause") {
    await service
      .from("workflow_runs")
      .update({status: "paused", updated_at: now})
      .eq("id", run.id);
  } else if (["resume", "retry"].includes(action)) {
    await service
      .from("workflow_runs")
      .update({status: "queued", resume_at: null, error: null, updated_at: now})
      .eq("id", run.id);
    await dispatchWorkflowRun(service, run.id);
  } else {
    return back(`/app/workflow-runs/${run.id}`, "Unknown run action.", true);
  }
  return back(`/app/workflow-runs/${run.id}`, `Workflow ${action} requested.`);
}

export async function approvalAction(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "approvals.decide")) {
    return back("/app/approvals", "You don't have permission to answer approvals.", true);
  }
  const approvalId = id.safeParse(String(form.get("id") ?? ""));
  const decision = z.enum(["approved", "rejected"]).safeParse(String(form.get("decision") ?? ""));
  if (!approvalId.success || !decision.success) {
    return back("/app/approvals", "Something went wrong. Please try again.", true);
  }
  try {
    await decideApproval(createServiceClient(), {
      organisationId: ctx.organisation.id,
      approvalId: approvalId.data,
      userId: ctx.user.id,
      decision: decision.data,
      comment: String(form.get("comment") ?? ""),
    });
    return back(
      `/app/approvals/${approvalId.data}`,
      decision.data === "approved"
        ? "Approved. The automation will carry on."
        : "Turned down. The automation has stopped.",
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      `/app/approvals/${approvalId.data}`,
      error instanceof Error ? error.message : "Your answer couldn't be saved. Please try again.",
      true,
    );
  }
}

export async function assignmentAction(form: FormData) {
  const ctx = await getActiveOrganisation();
  const role = ctx.membership.role as OrganisationRole;
  if (!hasPermission(role, "workflow.run")) {
    return back("/app/workflow-runs", "You cannot complete workflow tasks.", true);
  }
  const assignmentId = id.safeParse(String(form.get("id") ?? ""));
  if (!assignmentId.success) {
    return back("/app/workflow-runs", "Invalid assignment.", true);
  }
  try {
    const result = await completeAssignment(createServiceClient(), {
      organisationId: ctx.organisation.id,
      assignmentId: assignmentId.data,
      userId: ctx.user.id,
      notes: String(form.get("notes") ?? ""),
    });
    return back(`/app/workflow-runs/${result.runId}`, "Confirmed.");
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return back(
      "/app/workflow-runs",
      error instanceof Error ? error.message : "Task could not be completed.",
      true,
    );
  }
}
