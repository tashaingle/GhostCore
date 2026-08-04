import Link from "next/link";

const UPDATED = "4 August 2026";

export const metadata = {
  title: "Privacy Policy · Ghost Core",
  description: "How Ghost Core collects, uses, and protects data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-semibold tracking-tight">
            Ghost Core
          </Link>
          <div className="flex gap-3 text-sm">
            <Link className="text-zinc-600 hover:text-zinc-900" href="/terms">
              Terms
            </Link>
            <Link className="text-zinc-600 hover:text-zinc-900" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <article className="prose prose-zinc mx-auto max-w-3xl px-6 py-12 prose-headings:scroll-mt-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">Privacy Policy</h1>
        <p className="text-zinc-600">Last updated: {UPDATED}</p>

        <p>
          This Privacy Policy describes how <strong>Ghost Core</strong> (“Ghost”, “we”, “us”)
          collects, uses, stores, and shares information when you use our website and application
          at <strong>ghost-core-two.vercel.app</strong> (the “Service”).
        </p>

        <h2>1. Who we are</h2>
        <p>
          Ghost Core is a multi-tenant operations and integrations platform. Organisation owners
          and members connect third-party business tools so activity can be normalised into an
          organisation-scoped timeline, insights, and workflows.
        </p>
        <p>
          Contact for privacy requests: use the email address associated with your Ghost account
          owner profile, or the contact method published on the Service homepage once a support
          address is configured.
        </p>

        <h2>2. Information we collect</h2>
        <h3>2.1 Account information</h3>
        <ul>
          <li>Email address and authentication identifiers (via Supabase Auth)</li>
          <li>Optional profile name and avatar</li>
          <li>Organisation name, membership role, and invitation records</li>
        </ul>

        <h3>2.2 Integration and provider data</h3>
        <p>
          When an organisation administrator connects a provider (for example Meta, Google,
          Stripe, Shopify, GitHub, Slack, Notion), we receive only what that provider returns under
          the scopes the admin approved. Depending on the connector, that may include:
        </p>
        <ul>
          <li>Account or Page identifiers and display names</li>
          <li>
            Aggregate performance metrics (for example followers, reach, impressions, video views,
            spend, orders)
          </li>
          <li>Operational events translated into our universal event model</li>
          <li>Encrypted OAuth access and refresh tokens used only to sync on your behalf</li>
        </ul>
        <p>
          Social connectors are <strong>read-only</strong>. We do not post, message, boost ads, or
          download private message bodies through organic social integrations.
        </p>

        <h3>2.3 Technical data</h3>
        <ul>
          <li>Session cookies required for authentication and workspace selection</li>
          <li>Server logs needed to operate and secure the Service</li>
          <li>Background job run metadata for reliability</li>
        </ul>

        <h2>3. How we use information</h2>
        <ul>
          <li>Provide authentication, multi-organisation workspaces, and role-based access</li>
          <li>Import, normalise, and display provider activity for the connecting organisation</li>
          <li>Generate deterministic insights, correlations, notifications, and workflows</li>
          <li>Maintain security, prevent abuse, and debug failures</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>We do not sell personal data.</p>

        <h2>4. Legal bases (where applicable)</h2>
        <p>
          Where GDPR or similar laws apply, we process data to perform our contract with you, with
          your consent (for example when connecting a provider), and for legitimate interests such
          as securing and improving the Service.
        </p>

        <h2>5. Sharing</h2>
        <p>We share data only as needed to run the Service:</p>
        <ul>
          <li>
            <strong>Infrastructure processors</strong> such as hosting (for example Vercel) and
            database/auth (Supabase)
          </li>
          <li>
            <strong>Connected providers</strong> you choose to authorise (Meta, Google,
            etc.), only via their OAuth/API flows
          </li>
          <li>Authorities if required by law</li>
        </ul>
        <p>
          Organisation data is isolated by tenant policies. Other organisations cannot access your
          workspace data through normal application flows.
        </p>

        <h2>6. Retention</h2>
        <ul>
          <li>Account and organisation data: while the account/organisation is active</li>
          <li>
            Integration tokens: until the admin disconnects the integration or the token expires
          </li>
          <li>
            Imported events and insights: retained for the organisation until deleted by an
            authorised process or account closure
          </li>
        </ul>

        <h2>7. Security</h2>
        <ul>
          <li>TLS in transit for production traffic</li>
          <li>Provider tokens encrypted at rest with server-side keys</li>
          <li>Organisation-scoped access control and database row-level security</li>
          <li>Least-privilege, read-only OAuth scopes for social connectors where possible</li>
        </ul>

        <h2>8. Your rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or export
          personal data, or to withdraw consent for a connected provider by disconnecting it in
          Integrations (and optionally revoking access in the provider’s security settings).
        </p>

        <h2>9. Meta (Facebook / Instagram) specific notes</h2>
        <p>
          When you connect <strong>Meta Social</strong> or <strong>Meta Ads</strong>, Ghost
          requests only the permissions shown on the Meta consent screen. Organic social access is
          used to import Page and Instagram professional aggregate insights for the organisation
          that connected the account. Ghost does not post or message on Facebook or Instagram.
        </p>
        <p>
          You can disconnect these integrations at any time in Ghost. You should also remove Ghost
          from your Meta Business / Facebook settings if you want tokens revoked at the provider.
        </p>

        <h2>10. Children</h2>
        <p>The Service is not directed to children under 16, and we do not knowingly collect their data.</p>

        <h2>11. Changes</h2>
        <p>
          We may update this policy. The “Last updated” date will change when we do. Continued use
          of the Service after changes means you accept the updated policy.
        </p>

        <h2>12. Contact</h2>
        <p>
          Privacy questions: contact the organisation that invited you, or the Ghost Core operator
          via the support channel listed on the Service.
        </p>

        <p className="not-prose mt-10">
          <Link className="button button-secondary" href="/terms">
            Terms of Service
          </Link>
        </p>
      </article>
    </main>
  );
}
