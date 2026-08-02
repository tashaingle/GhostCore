import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {correlationDashboard} from "@/lib/correlations/dashboard";
import {runCorrelationsAction} from "@/app/correlation-actions";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {
  humanRelationship,
  humanStrength,
  providerLabel,
} from "@/lib/ui/labels";

export default async function CorrelationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;

  const relationship =
    typeof params.relationship === "string" ? params.relationship : "";
  const strength = typeof params.strength === "string" ? params.strength : "";

  let query = ctx.supabase
    .from("event_correlations")
    .select(
      "id,relationship_type,strength,active,source_provider,target_provider,score,rule_key,rule_version,occurred_at,created_at",
    )
    .eq("organisation_id", ctx.organisation.id)
    .order("occurred_at", {ascending: false})
    .limit(200);
  if (relationship) query = query.eq("relationship_type", relationship);
  if (strength) query = query.eq("strength", strength);

  const [{data: rows}, {data: runs}] = await Promise.all([
    query,
    ctx.supabase
      .from("correlation_runs")
      .select(
        "status,candidates_evaluated,correlations_created,duplicates_skipped,error_count,duration_ms,started_at",
      )
      .eq("organisation_id", ctx.organisation.id)
      .order("started_at", {ascending: false})
      .limit(10),
  ]);

  const metrics = correlationDashboard(rows ?? []);
  const canRun = hasPermission(
    ctx.membership.role as OrganisationRole,
    "correlation.run",
  );

  return (
    <section className="space-y-6">
      <PageHeader
        title="Correlations"
        description="Possible links between events from different tools — for example a deploy near a traffic drop. A link is a clue, not proof that one caused the other."
        actions={
          <>
            <Link className="button button-secondary" href="/app/correlations/rules">
              Matching rules
            </Link>
            {canRun ? (
              <form action={runCorrelationsAction}>
                <input type="hidden" name="days" value="7" />
                <button className="button">Find links (last 7 days)</button>
              </form>
            ) : null}
          </>
        }
      />
      <Notice searchParams={params} />

      <div className="info-banner">
        <strong>How to read this:</strong> Ghost compares events with fixed rules (not AI
        guesswork). Higher scores mean a stronger match. Always check the evidence before
        acting.
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Active links", metrics.active],
          ["Strong", metrics.strong],
          ["Possible", metrics.moderate],
          ["Invalidated", metrics.invalidated],
          ["Tools involved", metrics.providers],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <form className="card flex flex-wrap gap-3">
        <select className="field" name="relationship" defaultValue={relationship}>
          <option value="">All relationship types</option>
          {metrics.relationships.map((x) => (
            <option key={x.name} value={x.name}>
              {humanRelationship(x.name)}
            </option>
          ))}
        </select>
        <select className="field" name="strength" defaultValue={strength}>
          <option value="">All strengths</option>
          {["confirmed", "strong", "moderate", "weak"].map((x) => (
            <option key={x} value={x}>
              {humanStrength(x)}
            </option>
          ))}
        </select>
        <button className="button">Filter</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h3 className="font-semibold">Recent links</h3>
          <div className="mt-3 space-y-2">
            {!rows?.length ? (
              <p className="text-sm text-zinc-500">
                No links yet. Sync a few tools (for example GitHub + Analytics, or Shopify +
                Stripe), then click <strong>Find links</strong>.
              </p>
            ) : (
              rows.map((row) => (
                <Link
                  className="card-interactive block rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50"
                  href={`/app/correlations/${row.id}`}
                  key={row.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>
                      {providerLabel(row.source_provider)} →{" "}
                      {providerLabel(row.target_provider)}
                    </strong>
                    <span className="badge badge-muted">
                      {humanStrength(row.strength)}
                    </span>
                    <span className="ml-auto text-sm text-zinc-500">
                      Score {row.score}/100
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">
                    {humanRelationship(row.relationship_type)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.active ? "Active" : "Inactive"} ·{" "}
                    {new Date(row.occurred_at).toLocaleString()}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold">Tool pairs</h3>
            {!metrics.pairs.length ? (
              <p className="mt-2 text-sm text-zinc-500">No pairs yet.</p>
            ) : (
              metrics.pairs.map((x) => (
                <p className="mt-2 flex justify-between text-sm" key={x.name}>
                  <span>
                    {x.name
                      .split(/[↔→-]/)
                      .map((part) => providerLabel(part.trim()))
                      .join(" ↔ ")}
                  </span>
                  <strong>{x.count}</strong>
                </p>
              ))
            )}
          </div>
          <div className="card">
            <h3 className="font-semibold">Recent matching runs</h3>
            {!runs?.length ? (
              <p className="mt-2 text-sm text-zinc-500">No runs yet.</p>
            ) : (
              runs.map((run, i) => (
                <p className="mt-2 text-sm text-zinc-600" key={i}>
                  <span className="capitalize">{run.status}</span> · checked{" "}
                  {run.candidates_evaluated} pairs · created {run.correlations_created} ·
                  skipped {run.duplicates_skipped} · {run.duration_ms ?? 0} ms
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
