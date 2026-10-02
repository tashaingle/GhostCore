import "server-only";
import {NextResponse} from "next/server";
import {insightApiContext, insightDatabaseError, isInsightId} from "./api-context";
import {transitionInsight, type InsightAction} from "./lifecycle";
import type {InsightStatus} from "./types";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
export async function transitionInsightApi(id: string, action: InsightAction) {
  const ctx = await insightApiContext();
  if (!ctx)
    return NextResponse.json(
      {error: {code: "unauthorized", message: "Authentication is required."}},
      {status: 401},
    );
  if (!hasPermission(ctx.membership.role as OrganisationRole, "insight.manage"))
    return NextResponse.json(
      {error: {code: "forbidden", message: "This role cannot update insights."}},
      {status: 403},
    );
  const {data} = isInsightId(id)
    ? await ctx.supabase
        .from("insights")
        .select("status")
        .eq("id", id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle()
    : {data: null};
  if (!data)
    return NextResponse.json(
      {error: {code: "not_found", message: "Insight not found."}},
      {status: 404},
    );
  const now = new Date().toISOString(),
    status = transitionInsight(data.status as InsightStatus, action),
    timestamp =
      action === "acknowledge"
        ? {acknowledged_at: now}
        : action === "dismiss"
          ? {dismissed_at: now}
          : {resolved_at: now};
  const {data: updated, error} = await ctx.supabase
    .from("insights")
    .update({status, ...timestamp, updated_at: now})
    .eq("id", id)
    .eq("organisation_id", ctx.organisationId)
    .select("*")
    .single();
  return error ? insightDatabaseError("update_failed", error) : NextResponse.json({data: updated});
}
