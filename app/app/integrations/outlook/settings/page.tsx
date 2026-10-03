import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {updateOutlookSettings} from "@/app/outlook-actions";
import {disconnectIntegration, syncIntegration} from "@/app/integration-actions";
import {Notice} from "@/components/notice";
import {PageHeader} from "@/components/page-header";
import {SubmitButton} from "@/components/submit-button";

const OPTIONS = [
  ["includeReceived", "Emails you receive"],
  ["includeSent", "Emails you send"],
  ["includeUnread", "Whether emails are unread"],
  ["includeAttachments", "Whether emails have attachments"],
] as const;

export default async function OutlookSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  const {data: mailboxes} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,status,last_sync_at,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "outlook")
    .order("created_at", {ascending: false});
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Outlook mailboxes"
        description="Metric Mage reads who emailed whom, when, and the subject line. Microsoft doesn't let it see the email text, previews or attachments."
      />
      <Notice searchParams={await searchParams} />
      {!mailboxes?.length ? (
        <div className="card space-y-3">
          <p>No Outlook mailbox connected yet.</p>
          <Link className="button" href="/api/integrations/outlook/connect">
            Connect Outlook
          </Link>
        </div>
      ) : (
        mailboxes.map((mailbox) => {
          const s = (mailbox.settings ?? {}) as Record<string, unknown>;
          return (
            <article className="card space-y-5" key={mailbox.id}>
              <div>
                <h2 className="font-semibold">{mailbox.provider_account_name}</h2>
                <p className="text-sm text-zinc-500">
                  {mailbox.last_sync_at
                    ? `Last synced ${new Date(mailbox.last_sync_at).toLocaleString("en-GB")}`
                    : "Not synced yet. The first sync brings in the last 7 days."}
                </p>
              </div>
              <form action={updateOutlookSettings} className="space-y-3">
                <input type="hidden" name="integrationId" value={mailbox.id} />
                <p className="text-sm font-medium text-zinc-700">What to include</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {OPTIONS.map(([name, label]) => (
                    <label className="flex items-center gap-2 text-sm" key={name}>
                      <input type="checkbox" name={name} defaultChecked={s[name] !== false} />
                      {label}
                    </label>
                  ))}
                </div>
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </form>
              <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                <form action={syncIntegration}>
                  <input type="hidden" name="integrationId" value={mailbox.id} />
                  <SubmitButton pendingLabel="Starting…">Sync now</SubmitButton>
                </form>
                <form action={disconnectIntegration}>
                  <input type="hidden" name="integrationId" value={mailbox.id} />
                  <SubmitButton className="button button-secondary" pendingLabel="Disconnecting…">
                    Disconnect
                  </SubmitButton>
                </form>
                <Link className="button button-secondary" href="/api/integrations/outlook/connect">
                  Connect another mailbox
                </Link>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
