import {DATE} from "@/lib/ui/dates";
import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {manualDashboardTotals} from "@/lib/integrations/manual/dashboard";
import {MANUAL_RECORD_TYPES, MANUAL_STATUSES} from "@/lib/integrations/manual/types";
import {EVENT_CATEGORIES} from "@/types/events";
import {createManualRecordAction} from "@/app/manual-actions";
import {ManualCsvImport} from "@/components/manual-csv-import";
import {Notice} from "@/components/notice";

const TOTAL_LABELS: Record<string, string> = {
  totalRecords: "Records",
  revenue: "Revenue",
  expenses: "Costs",
  leads: "Leads",
  marketingSpend: "Marketing spend",
  offlineSales: "Offline sales",
  customKpis: "Your own figures",
};
const TYPE_LABELS: Record<string, string> = {
  revenue: "Revenue",
  expense: "Cost",
  lead: "Lead",
  opportunity: "Possible deal",
  customer: "New customer",
  contract: "Contract",
  quote: "Quote",
  refund: "Refund",
  stock_adjustment: "Stock change",
  kpi_snapshot: "Your own figure",
  marketing_spend: "Marketing spend",
  offline_sale: "Offline sale",
  phone_enquiry: "Phone enquiry",
  event_attendance: "Event attendance",
  donation: "Donation",
  custom: "Other",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  recorded: "Recorded",
  open: "Open",
  won: "Won",
  lost: "Lost",
  paid: "Paid",
  unpaid: "Unpaid",
  refunded: "Refunded",
  cancelled: "Cancelled",
  completed: "Completed",
};
const manualTypeLabel = (v: string) => TYPE_LABELS[v] ?? v.replaceAll("_", " ");
const manualStatusLabel = (v: string) => STATUS_LABELS[v] ?? v;
export default async function ManualDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const params = await searchParams,
    [{data: rows}, {data: imports}] = await Promise.all([
      ctx.supabase
        .from("manual_records")
        .select(
          "id,title,record_type,amount,currency,status,occurred_at,external_reference,archived_at",
        )
        .eq("organisation_id", ctx.organisation.id)
        .order("occurred_at", {ascending: false})
        .limit(500),
      ctx.supabase
        .from("manual_imports")
        .select("id,filename,row_count,successful,failed,duplicates,duration_ms,created_at")
        .eq("organisation_id", ctx.organisation.id)
        .order("created_at", {ascending: false})
        .limit(10),
    ]),
    totals = manualDashboardTotals(rows ?? []);
  return (
    <section className="space-y-6">
      <div>
        <Link className="text-sm text-zinc-500" href="/app/integrations">
          ← Connections
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Add data yourself
        </h1>
        <p className="text-zinc-600">
          Record sales, costs, leads and more by hand, or upload a spreadsheet. Every change is kept
          in the history.
        </p>
      </div>
      <Notice searchParams={params} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(totals).map(([k, v]) => (
          <article className="card" key={k}>
            <p className="text-sm text-zinc-500">{TOTAL_LABELS[k] ?? k}</p>
            <p className="text-xl font-semibold">{v}</p>
          </article>
        ))}
      </div>
      <form action={createManualRecordAction} className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <h3 className="font-semibold">Add a record</h3>
          <p className="text-sm text-zinc-500">
            For things your connected tools don&apos;t know about, like a cash sale or a phone
            enquiry.
          </p>
        </div>
        <label className="md:col-span-2">
          What is it?
          <input
            className="input mt-1 w-full"
            name="title"
            placeholder="For example: Craft fair sales"
            required
          />
        </label>
        <label>
          Type
          <select className="input mt-1 w-full" name="recordType">
            {MANUAL_RECORD_TYPES.map((v) => (
              <option key={v} value={v}>
                {manualTypeLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          When
          <input className="input mt-1 w-full" name="occurredAt" type="datetime-local" required />
        </label>
        <label>
          Amount <span className="text-zinc-400">(optional)</span>
          <input
            className="input mt-1 w-full"
            name="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
          />
        </label>
        <label>
          Currency
          <input className="input mt-1 w-full" name="currency" defaultValue="GBP" maxLength={3} />
        </label>
        <label>
          Status
          <select className="input mt-1 w-full" name="status" defaultValue="recorded">
            {MANUAL_STATUSES.map((v) => (
              <option key={v} value={v}>
                {manualStatusLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Area of the business
          <select className="input mt-1 w-full" name="category" defaultValue="sales">
            {EVENT_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <details className="text-sm md:col-span-2">
          <summary className="cursor-pointer text-zinc-500">More details (optional)</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label>
              Customer
              <input className="input mt-1 w-full" name="customerName" />
            </label>
            <label>
              Your reference
              <input
                className="input mt-1 w-full"
                name="externalReference"
                placeholder="For example, an invoice number"
              />
            </label>
            <label className="md:col-span-2">
              Tags
              <input className="input mt-1 w-full" name="tags" placeholder="Separate with commas" />
            </label>
          </div>
        </details>
        <button className="button md:col-span-2">Add record</button>
      </form>
      <ManualCsvImport />
      <div className="card">
        <h3 className="font-semibold">Spreadsheet templates</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Download one, fill it in, then upload it above.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["revenue", "expense", "lead", "marketing_spend", "kpi_snapshot"].map((n) => (
            <Link
              className="button button-secondary"
              href={`/api/integrations/manual/templates/${n}`}
              key={n}
            >
              {manualTypeLabel(n)}
            </Link>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">What</th>
              <th>Type</th>
              <th>When</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Your reference</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr className="border-b" key={r.id}>
                <td className="p-3">{r.title}</td>
                <td>{manualTypeLabel(r.record_type)}</td>
                <td>{new Date(r.occurred_at).toLocaleDateString("en-GB", DATE)}</td>
                <td>{r.amount === null ? "" : `${r.currency ?? ""} ${r.amount}`}</td>
                <td>{r.archived_at ? "Archived" : manualStatusLabel(r.status)}</td>
                <td>{r.external_reference ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 className="font-semibold">Recent uploads</h3>
        {!imports?.length ? (
          <p className="text-sm text-zinc-500">No spreadsheets uploaded yet.</p>
        ) : (
          imports.map((i) => (
            <p className="text-sm" key={i.id}>
              {`${i.filename}: ${i.successful} of ${i.row_count} rows added${
                i.duplicates ? `, ${i.duplicates} already there` : ""
              }${i.failed ? `, ${i.failed} couldn't be read` : ""}`}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
