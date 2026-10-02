import Link from "next/link";

export const metadata = {
  title: "Data deletion · Ghost Core",
  description: "How to delete your Ghost Core account and the data from your connected tools.",
};

/** Public instructions for deleting data; also used as the data-deletion URL in app reviews. */
export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-semibold tracking-tight">
            Ghost Core
          </Link>
          <div className="flex gap-3 text-sm">
            <Link className="text-zinc-600 hover:text-zinc-900" href="/privacy">
              Privacy
            </Link>
            <Link className="text-zinc-600 hover:text-zinc-900" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-zinc-700">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
            Deleting your data
          </h1>
        </div>

        <p>
          You can delete your data from Ghost Core yourself at any time. Deletion is permanent and
          takes effect immediately.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-zinc-950">
            Stop Ghost reading a connected tool
          </h2>
          <p>
            In Ghost, open <strong>Connections</strong>, find the tool (for example Facebook, Google
            or Shopify) and click <strong>Disconnect</strong>. Ghost deletes its stored access to
            that tool straight away and stops importing from it. You can also remove Ghost
            Core&apos;s access from the tool&apos;s own settings, such as Facebook&apos;s
            &quot;Business Integrations&quot; or your Google Account&apos;s &quot;Third-party
            connections&quot;.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-zinc-950">Delete an organisation</h2>
          <p>
            Owners can open <strong>Settings → Danger zone → Delete this organisation</strong>. This
            deletes the organisation and everything in it, including data imported from connected
            tools, alerts, insights, tasks and automations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-zinc-950">Delete your account</h2>
          <p>
            Open <strong>Settings → Danger zone → Delete my account</strong>. Your login and
            personal details are deleted, along with any organisation that only you belong to. In
            organisations shared with others, the team&apos;s records remain but are no longer
            linked to you.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold text-zinc-950">Can&apos;t sign in?</h2>
          <p>
            If you can&apos;t access your account, contact the owner of your organisation, or the
            contact listed in our{" "}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            , and ask for your data to be deleted. We&apos;ll confirm once it&apos;s done.
          </p>
        </section>
      </article>
    </main>
  );
}
