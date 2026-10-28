import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import type {IntelligenceEvent} from "@/lib/intelligence/types";
import {
  highlights as buildHighlights,
  PERFORMANCE_EVENT_TYPES,
  PERIOD_DAYS,
  performanceMetrics,
  type Period,
} from "./performance";
import {explainHighlights, WHY_EVENT_TYPES} from "./why";

const DAY_MS = 86_400_000;

/**
 * Everything "How you're doing" needs for one organisation and period. Shared by Home and the
 * Monday email so they always say the same thing.
 */
export async function loadPerformance(
  client: SupabaseClient<Database>,
  organisationId: string,
  period: Period,
  now = new Date(),
) {
  const days = PERIOD_DAYS[period],
    currentStart = new Date(now.getTime() - days * DAY_MS).toISOString(),
    previousStart = new Date(now.getTime() - 2 * days * DAY_MS).toISOString();
  // Counted rather than loaded, as these can be numerous over a year.
  const countEvents = (types: string[], from: string, to?: string) => {
    let q = client
      .from("events")
      .select("id", {count: "exact", head: true})
      .eq("organisation_id", organisationId)
      .in("event_type", types)
      .gte("occurred_at", from);
    if (to) q = q.lt("occurred_at", to);
    return q.then((r) => r.count ?? 0);
  };
  const countPair = async (types: string[]) => ({
    current: await countEvents(types, currentStart),
    previous: await countEvents(types, previousStart, currentStart),
  });

  const [{data: rows}, {count: updates}, emails, meetings, deployments, failedBuilds] =
    await Promise.all([
      client
        .from("events")
        .select("id,source,event_type,title,occurred_at,created_at,metadata")
        .eq("organisation_id", organisationId)
        .in("event_type", [...PERFORMANCE_EVENT_TYPES, ...WHY_EVENT_TYPES])
        .gte("occurred_at", previousStart)
        .limit(20000),
      // Updates from connected tools; Metric Mage's own audit trail is not business activity.
      client
        .from("events")
        .select("id", {count: "exact", head: true})
        .eq("organisation_id", organisationId)
        .neq("source", "ghost")
        .gte("occurred_at", currentStart),
      countPair(["gmail.message_received", "outlook.message_received"]),
      countPair(["google_calendar.event_created"]),
      countPair(["workflow.success", "release.published"]),
      countPair(["workflow.failed"]),
    ]);

  const events: IntelligenceEvent[] = (rows ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    eventType: e.event_type,
    title: e.title,
    description: null,
    severity: "info",
    occurredAt: e.occurred_at,
    recordedAt: e.created_at,
    metadata:
      e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
        ? (e.metadata as Record<string, unknown>)
        : {},
  }));
  const metrics = performanceMetrics({
    events,
    counts: {emails, meetings, deployments, failedBuilds},
    period,
    now,
  });
  // Each "needs a look" says what else changed (or didn't) across the other tools.
  const highlights = explainHighlights({
    highlights: buildHighlights(metrics, period),
    metrics,
    events,
    period,
    now,
  });
  return {metrics, highlights, updates: updates ?? 0};
}

/** Portfolio dashboards need one summary per organisation. Loading them separately multiplies the
 * same event and count queries by the number of projects, so this path fetches the bounded event
 * window once and calculates every summary locally. */
export async function loadPerformanceMany(
  client: SupabaseClient<Database>,
  organisationIds: string[],
  period: Period,
  now = new Date(),
) {
  if (!organisationIds.length)
    return new Map<string, Awaited<ReturnType<typeof loadPerformance>>>();
  const days = PERIOD_DAYS[period],
    currentStart = new Date(now.getTime() - days * DAY_MS).toISOString(),
    previousStart = new Date(now.getTime() - 2 * days * DAY_MS).toISOString(),
    activityTypes = [
      "gmail.message_received",
      "outlook.message_received",
      "google_calendar.event_created",
      "workflow.success",
      "release.published",
      "workflow.failed",
    ];
  const {data: rows} = await client
    .from("events")
    .select("id,organisation_id,source,event_type,title,occurred_at,created_at,metadata")
    .in("organisation_id", organisationIds)
    .in("event_type", [
      ...new Set([...PERFORMANCE_EVENT_TYPES, ...WHY_EVENT_TYPES, ...activityTypes]),
    ])
    .gte("occurred_at", previousStart)
    .limit(20000);
  const grouped = new Map<string, NonNullable<typeof rows>>();
  for (const row of rows ?? []) {
    const list = grouped.get(row.organisation_id) ?? [];
    list.push(row);
    grouped.set(row.organisation_id, list);
  }
  return new Map(
    organisationIds.map((organisationId) => {
      const source = grouped.get(organisationId) ?? [];
      const events: IntelligenceEvent[] = source.map((event) => ({
        id: event.id,
        source: event.source,
        eventType: event.event_type,
        title: event.title,
        description: null,
        severity: "info",
        occurredAt: event.occurred_at,
        recordedAt: event.created_at,
        metadata:
          event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
            ? (event.metadata as Record<string, unknown>)
            : {},
      }));
      const pair = (types: string[]) => ({
        current: source.filter(
          (event) => types.includes(event.event_type) && event.occurred_at >= currentStart,
        ).length,
        previous: source.filter(
          (event) =>
            types.includes(event.event_type) &&
            event.occurred_at >= previousStart &&
            event.occurred_at < currentStart,
        ).length,
      });
      const metrics = performanceMetrics({
        events,
        counts: {
          emails: pair(["gmail.message_received", "outlook.message_received"]),
          meetings: pair(["google_calendar.event_created"]),
          deployments: pair(["workflow.success", "release.published"]),
          failedBuilds: pair(["workflow.failed"]),
        },
        period,
        now,
      });
      return [
        organisationId,
        {
          metrics,
          highlights: explainHighlights({
            highlights: buildHighlights(metrics, period),
            metrics,
            events,
            period,
            now,
          }),
          updates: 0,
        },
      ] as const;
    }),
  );
}
