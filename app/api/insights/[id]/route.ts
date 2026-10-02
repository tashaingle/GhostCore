import {NextResponse} from "next/server";
import {insightApiContext, insightDatabaseError, isInsightId} from "@/lib/intelligence/api-context";
const notFound = () =>
  NextResponse.json({error: {code: "not_found", message: "Insight not found."}}, {status: 404});
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const ctx = await insightApiContext();
  if (!ctx)
    return NextResponse.json(
      {error: {code: "unauthorized", message: "Authentication is required."}},
      {status: 401},
    );
  const {id} = await params;
  if (!isInsightId(id)) return notFound();
  const {data, error} = await ctx.supabase
    .from("insights")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", ctx.organisationId)
    .maybeSingle();
  if (error) return insightDatabaseError("query_failed", error);
  if (!data) return notFound();
  let evidence: unknown[] = [];
  if (data.source_event_ids.length) {
    const result = await ctx.supabase
      .from("events")
      .select("id,source,event_type,title,description,severity,occurred_at,metadata")
      .eq("organisation_id", ctx.organisationId)
      .in("id", data.source_event_ids);
    if (result.error) return insightDatabaseError("evidence_failed", result.error);
    evidence = result.data ?? [];
  }
  return NextResponse.json({data: {...data, evidence}});
}
