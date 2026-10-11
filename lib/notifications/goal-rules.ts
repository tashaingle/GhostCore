import {loadGoals} from "@/lib/goals/load";
import {GOAL_METRICS, monthWindow} from "@/lib/goals/progress";
import type {NotificationCandidate, NotificationRuleDefinition} from "./types";

/** From this day of the month, a goal that's behind becomes an alert. */
export const GOAL_CHECK_DAY = 15;

/** The local day of the month. */
const dayOfMonth = (now: Date, timeZone: string) =>
  Number(new Intl.DateTimeFormat("en-GB", {timeZone, day: "numeric"}).format(now));

/**
 * A monthly goal that won't be reached at the current pace, from mid-month. It resolves itself
 * once the pace catches up, and a new month starts fresh.
 */
export const goalBehindRule: NotificationRuleDefinition = {
  key: "goal_behind",
  version: 1,
  name: "Goal falling behind",
  description: "From mid-month, a monthly goal that won't be reached at the current pace.",
  category: "financial",
  defaultSeverity: "warning",
  async evaluate(c): Promise<NotificationCandidate[]> {
    const {data: organisation} = await c.client
        .from("organisations")
        .select("timezone")
        .eq("id", c.organisationId)
        .maybeSingle(),
      timeZone = organisation?.timezone || "Europe/London";
    if (dayOfMonth(c.now, timeZone) < GOAL_CHECK_DAY) return [];
    const month = new Date(monthWindow(c.now, timeZone).start).toISOString().slice(0, 7);
    return (await loadGoals(c.client, c.organisationId, c.now, timeZone))
      .filter((g) => g.status === "behind")
      .map((g) => ({
        organisationId: c.organisationId,
        ruleKey: goalBehindRule.key,
        ruleVersion: goalBehindRule.version,
        category: goalBehindRule.category,
        severity: "warning",
        title: `${g.label} is behind your goal for ${g.monthName}`,
        summary: `${g.valueText} so far. ${g.summary}`,
        explanation: `Halfway through the month you'd expect to be about ${Math.round(g.elapsed * 100)}% of the way there; you're ${Math.round(g.reached * 100)}%. Metric Mage counts ${GOAL_METRICS[g.goal.metric].sources}.`,
        recommendedAction:
          g.goal.metric === "revenue"
            ? "Look at what usually brings sales in, like an email to customers, an offer, or turning ads back up, and check Home for anything that dropped."
            : "Check Home for anything that dropped, like visitors or ads, and consider an offer or email to bring orders in.",
        sourceType: "goal",
        sourceId: g.goal.id,
        condition: `goal_behind:${g.goal.metric}`,
        fingerprintParts: [c.organisationId, goalBehindRule.key, g.goal.id, month],
        evidence: [
          {
            evidenceType: "goal",
            sourceTable: "goals",
            sourceId: g.goal.id,
            label: `${g.label} goal`,
            description: g.valueText,
            observed: {soFar: Math.round(g.value), onPaceFor: Math.round(g.projected)},
            expected: {target: g.goal.target},
            occurredAt: c.now.toISOString(),
          },
        ],
      }));
  },
};
