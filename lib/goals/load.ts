import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {goalProgress, isGoalMetric, monthWindow, type Goal, type GoalData} from "./progress";

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const record = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Sales you add yourself that count as money in. */
const MANUAL_SALE_TYPES = ["revenue", "offline_sale"];
const MANUAL_SALE_STATUSES = ["recorded", "paid", "won", "completed"];

/** The organisation's goals with this month's progress. Empty when no goals are set. */
export async function loadGoals(
  client: SupabaseClient<Database>,
  organisationId: string,
  now = new Date(),
  timeZone = "Europe/London",
) {
  const {data: rows} = await client
    .from("goals")
    .select("id,metric,target,currency")
    .eq("organisation_id", organisationId)
    .order("metric");
  const goals: Goal[] = (rows ?? []).flatMap((g) =>
    isGoalMetric(g.metric)
      ? [{id: g.id, metric: g.metric, target: Number(g.target), currency: g.currency}]
      : [],
  );
  if (!goals.length) return [];

  const since = new Date(monthWindow(now, timeZone).start).toISOString(),
    wants = new Set(goals.map((g) => g.metric));
  const [{data: events}, {data: manual}] = await Promise.all([
    client
      .from("events")
      .select("event_type,occurred_at,metadata")
      .eq("organisation_id", organisationId)
      .in("event_type", [
        ...(wants.has("revenue") ? ["stripe.payment_succeeded"] : []),
        ...(wants.has("orders") ? ["shopify.order_created"] : []),
      ])
      .gte("occurred_at", since)
      .limit(20000),
    wants.has("revenue")
      ? client
          .from("manual_records")
          .select("occurred_at,amount,currency")
          .eq("organisation_id", organisationId)
          .in("record_type", MANUAL_SALE_TYPES)
          .in("status", MANUAL_SALE_STATUSES)
          .is("archived_at", null)
          .gte("occurred_at", since)
          .limit(5000)
      : Promise.resolve({data: []}),
  ]);

  const data: GoalData = {payments: [], manualSales: [], orders: []};
  for (const e of events ?? []) {
    const at = Date.parse(e.occurred_at),
      m = record(e.metadata);
    if (e.event_type === "shopify.order_created") data.orders.push({at});
    else if (num(m.amountMinor) !== null && typeof m.currency === "string")
      data.payments.push({
        at,
        amountMinor: num(m.amountMinor)!,
        currency: m.currency,
        live: m.mode === "live",
      });
  }
  for (const r of manual ?? []) {
    const amount = num(r.amount);
    if (amount !== null && r.currency)
      data.manualSales.push({at: Date.parse(r.occurred_at), amount, currency: r.currency});
  }
  return goals.map((goal) => goalProgress(goal, data, now, timeZone));
}
