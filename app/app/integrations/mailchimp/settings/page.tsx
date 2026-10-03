import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {saveMailchimpAudiences} from "@/app/mailchimp-actions";
import {disconnectIntegration, syncIntegration} from "@/app/integration-actions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {SubmitButton} from "@/components/submit-button";

export default async function MailchimpSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const {data: accounts} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,last_sync_at,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "mailchimp")
    .order("created_at", {ascending: false});
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Mailchimp audiences"
        description="Choose which audiences Metric Mage includes. It reads subscriber numbers and how your campaigns did, once a day. It never sends, edits or deletes anything."
      />
      <Notice searchParams={await searchParams} />
      {!accounts?.length ? (
        <div className="card space-y-3">
          <p>Mailchimp isn&apos;t connected yet.</p>
          <Link className="button" href="/api/integrations/mailchimp/connect">
            Connect Mailchimp
          </Link>
        </div>
      ) : (
        accounts.map((account) => {
          const s = (account.settings ?? {}) as {
            audiences?: {id: string; name: string; selected?: boolean}[];
          };
          return (
            <article className="card space-y-5" key={account.id}>
              <div>
                <h2 className="font-semibold">{account.provider_account_name}</h2>
                <p className="text-sm text-zinc-500">
                  {account.last_sync_at
                    ? `Last synced ${new Date(account.last_sync_at).toLocaleString("en-GB")}`
                    : "Not synced yet. The first sync brings in the last 90 days of campaigns."}
                </p>
              </div>
              <form action={saveMailchimpAudiences} className="space-y-3">
                <input type="hidden" name="integrationId" value={account.id} />
                {!s.audiences?.length ? (
                  <p className="text-sm text-zinc-500">This account has no audiences yet.</p>
                ) : (
                  <div className="space-y-2">
                    {s.audiences.map((a) => (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="audience"
                          value={a.id}
                          defaultChecked={a.selected !== false}
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                )}
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                <form action={syncIntegration}>
                  <input type="hidden" name="integrationId" value={account.id} />
                  <SubmitButton pendingLabel="Starting…">Sync now</SubmitButton>
                </form>
                <form action={disconnectIntegration}>
                  <input type="hidden" name="integrationId" value={account.id} />
                  <SubmitButton className="button button-secondary" pendingLabel="Disconnecting…">
                    Disconnect
                  </SubmitButton>
                </form>
              </div>
              <p className="text-xs text-zinc-500">
                Mailchimp gives connected apps access to the whole account, but Metric Mage only
                ever reads. To remove its access completely, also go to Profile → Connected sites in
                Mailchimp.
              </p>
            </article>
          );
        })
      )}
    </section>
  );
}
