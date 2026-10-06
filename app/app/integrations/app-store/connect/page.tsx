import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {connectAppStore} from "@/app/app-store-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export default async function ConnectAppStore({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Connect the App Store"
        description="Apple connects with an App Store Connect API key instead of a sign-in. Metric Mage only uses it to read your apps and their reviews."
      />
      <Notice searchParams={params} />
      <ol className="card list-decimal space-y-2 pl-8 text-sm text-zinc-600">
        <li>
          In App Store Connect, open <strong>Users and Access</strong>, then{" "}
          <strong>Integrations</strong>, then <strong>Team Keys</strong>.
        </li>
        <li>
          Generate a key with the <strong>Customer Support</strong> role. It can read reviews
          without seeing sales or changing your apps.
        </li>
        <li>Download the .p8 file. Apple only lets you download it once.</li>
        <li>Copy the Issuer ID shown above the keys, and the new key&apos;s Key ID.</li>
      </ol>
      <form action={connectAppStore} className="card space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-950">Issuer ID</span>
          <input
            className="field w-full font-mono"
            name="issuerId"
            required
            autoComplete="off"
            placeholder="57246542-96fe-1a63-e053-0824d011072a"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-950">Key ID</span>
          <input
            className="field w-full font-mono"
            name="keyId"
            required
            autoComplete="off"
            placeholder="2X9R4HXF34"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-950">Private key (.p8 file contents)</span>
          <textarea
            className="field w-full font-mono text-xs"
            name="privateKey"
            required
            rows={7}
            autoComplete="off"
            spellCheck={false}
            placeholder={"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"}
          />
        </label>
        <p className="text-sm text-zinc-500">
          The key is encrypted before it is saved. Revoke it in App Store Connect at any time to cut
          Metric Mage off.
        </p>
        <SubmitButton pendingLabel="Checking with Apple…">Connect App Store</SubmitButton>
      </form>
    </section>
  );
}
