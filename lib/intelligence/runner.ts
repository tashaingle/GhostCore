import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database, Json} from "@/types/database";
import {INTELLIGENCE_CONFIG as C} from "./config";
import {insightFingerprint} from "./fingerprint";
import {intelligenceRules} from "./rules";
import type {InsightCandidate, IntelligenceEvent, IntelligenceRule} from "./types";

export type EvaluatedInsight = InsightCandidate & {ruleId: string; fingerprint: string};

/** Set on an insight Metric Mage closed itself, so it can reopen if the rule reports it again. */
export const AUTO_RESOLVED = "autoResolved";

type OpenInsight = {id: string; rule_id: string; fingerprint: string};

/**
 * Open insights from these rules that the latest run no longer reports: the problem has gone
 * (or, for weekly insights, the week has passed), so they should close.
 */
export function staleInsights<T extends OpenInsight>(
  open: T[],
  reported: Set<string>,
  ruleIds: Set<string> = new Set(intelligenceRules.map((rule) => rule.id)),
) {
  return open.filter((row) => ruleIds.has(row.rule_id) && !reported.has(row.fingerprint));
}

/** A resolved insight reopens when reported again, unless a person resolved it. */
export function reopens(previous: {status: string; metadata: unknown}) {
  const metadata =
    previous.metadata && typeof previous.metadata === "object"
      ? (previous.metadata as Record<string, unknown>)
      : {};
  return previous.status === "resolved" && metadata[AUTO_RESOLVED] === true;
}
export type IntelligenceRunSummary = {
  evaluatedRules: number;
  candidates: number;
  inserted: number;
  updated: number;
  resolved: number;
};

export function evaluateRules(
  events: IntelligenceEvent[],
  rules: IntelligenceRule[] = intelligenceRules,
  now = new Date(),
): EvaluatedInsight[] {
  return [...rules]
    .sort((a, b) => a.priority - b.priority)
    .flatMap((rule) =>
      rule.evaluate(events, {now}).map((candidate) => ({
        ...candidate,
        confidence: Math.max(0, Math.min(100, Math.round(candidate.confidence))),
        sourceEventIds: [...new Set(candidate.sourceEventIds)].sort(),
        ruleId: rule.id,
        fingerprint: insightFingerprint(rule.id, candidate.fingerprintKey),
      })),
    );
}

export async function runIntelligence(
  supabase: SupabaseClient<Database>,
  organisationId: string,
): Promise<IntelligenceRunSummary> {
  const since = new Date(Date.now() - C.rollingWindowDays * 86400000).toISOString();
  const {data, error} = await supabase
    .from("events")
    .select("id,source,event_type,title,description,severity,occurred_at,created_at,metadata")
    .eq("organisation_id", organisationId)
    .gte("occurred_at", since)
    .order("occurred_at", {ascending: false})
    .limit(C.maxEvents);
  if (error) throw new Error(`Intelligence could not load events: ${error.message}`);
  const events: IntelligenceEvent[] = (data ?? []).map((event) => ({
    id: event.id,
    source: event.source,
    eventType: event.event_type,
    title: event.title,
    description: event.description,
    severity: event.severity as IntelligenceEvent["severity"],
    occurredAt: event.occurred_at,
    recordedAt: event.created_at,
    metadata:
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {},
  }));
  const candidates = evaluateRules(events),
    fingerprints = candidates.map((item) => item.fingerprint);
  const existing = new Map<string, {id: string; status: string; metadata: unknown}>();
  if (fingerprints.length) {
    const {data: rows, error: existingError} = await supabase
      .from("insights")
      .select("id,fingerprint,status,metadata")
      .eq("organisation_id", organisationId)
      .in("fingerprint", fingerprints);
    if (existingError)
      throw new Error(`Intelligence could not inspect existing insights: ${existingError.message}`);
    for (const row of rows ?? [])
      existing.set(row.fingerprint, {id: row.id, status: row.status, metadata: row.metadata});
  }
  let inserted = 0,
    updated = 0,
    resolved = 0;
  const now = new Date().toISOString();
  for (const candidate of candidates) {
    const previous = existing.get(candidate.fingerprint);
    const values = {
      title: candidate.title,
      summary: candidate.summary,
      severity: candidate.severity,
      confidence: candidate.confidence,
      rule_id: candidate.ruleId,
      explanation: candidate.explanation,
      recommendation: candidate.recommendation,
      metadata: (candidate.metadata ?? {}) as Json,
      source_event_ids: candidate.sourceEventIds,
      updated_at: now,
    };
    if (previous) {
      const {error: updateError} = await supabase
        .from("insights")
        .update(reopens(previous) ? {...values, status: "active", resolved_at: null} : values)
        .eq("id", previous.id)
        .eq("organisation_id", organisationId);
      if (updateError)
        throw new Error(`Intelligence could not update an insight: ${updateError.message}`);
      updated++;
    } else {
      const {error: insertError} = await supabase.from("insights").insert({
        ...values,
        organisation_id: organisationId,
        fingerprint: candidate.fingerprint,
        status: "active",
      });
      if (insertError)
        throw new Error(`Intelligence could not create an insight: ${insertError.message}`);
      inserted++;
    }
    if (candidate.resolveRuleIds?.length) {
      const {data: resolvedRows, error: resolveError} = await supabase
        .from("insights")
        .update({status: "resolved", resolved_at: now, updated_at: now})
        .eq("organisation_id", organisationId)
        .in("rule_id", candidate.resolveRuleIds)
        .in("status", ["active", "acknowledged"])
        .select("id");
      if (resolveError)
        throw new Error(
          `Intelligence could not resolve recovered insights: ${resolveError.message}`,
        );
      resolved += resolvedRows?.length ?? 0;
    }
  }
  // Close what the rules no longer report. Dismissed insights and ones from other sources stay as they are.
  const {data: open, error: openError} = await supabase
    .from("insights")
    .select("id,rule_id,fingerprint,metadata")
    .eq("organisation_id", organisationId)
    .in("status", ["active", "acknowledged"])
    .limit(500);
  if (openError)
    throw new Error(`Intelligence could not inspect open insights: ${openError.message}`);
  for (const row of staleInsights(open ?? [], new Set(fingerprints))) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, Json>)
        : {};
    const {error: closeError} = await supabase
      .from("insights")
      .update({
        status: "resolved",
        resolved_at: now,
        updated_at: now,
        metadata: {...metadata, [AUTO_RESOLVED]: true},
      })
      .eq("id", row.id)
      .eq("organisation_id", organisationId)
      .in("status", ["active", "acknowledged"]);
    if (closeError)
      throw new Error(`Intelligence could not close a finished insight: ${closeError.message}`);
    resolved++;
  }
  return {
    evaluatedRules: intelligenceRules.length,
    candidates: candidates.length,
    inserted,
    updated,
    resolved,
  };
}
