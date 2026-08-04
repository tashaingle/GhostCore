import Link from "next/link";

const UPDATED = "4 August 2026";

export const metadata = {
  title: "Terms of Service · Ghost Core",
  description: "Terms governing use of the Ghost Core service.",
};

export default function TermsPage() {
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

      <article className="prose prose-zinc mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">Terms of Service</h1>
        <p className="text-zinc-600">Last updated: {UPDATED}</p>

        <p>
          These Terms of Service (“Terms”) govern access to and use of <strong>Ghost Core</strong>{" "}
          (the “Service”) at <strong>ghost-core-two.vercel.app</strong>. By creating an account or
          using the Service, you agree to these Terms.
        </p>

        <h2>1. The Service</h2>
        <p>
          Ghost Core provides organisation workspaces that connect third-party tools, import
          activity into a unified timeline, and surface operational insights, jobs, workflows, and
          work management features. Features may change as the product evolves.
        </p>

        <h2>2. Accounts and organisations</h2>
        <ul>
          <li>You must provide accurate registration information and keep credentials secure.</li>
          <li>
            Organisation owners and admins control membership, roles, and which integrations are
            connected.
          </li>
          <li>
            You are responsible for activity under your account and for the data your organisation
            imports.
          </li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Violate law or third-party rights</li>
          <li>Attempt to access another organisation’s data without authorisation</li>
          <li>Abuse APIs, reverse engineer the Service for competing abuse, or disrupt service</li>
          <li>
            Use connected provider access beyond the scopes granted or for purposes outside your
            organisation’s legitimate operations
          </li>
        </ul>

        <h2>4. Third-party services</h2>
        <p>
          Integrations (including Meta, Google, Stripe, Shopify, GitHub, Slack, Notion, and
          others) are provided by third parties. Their terms and privacy policies apply to your use
          of those platforms. Ghost does not control provider outages, API changes, rate limits, or
          approval of developer apps.
        </p>
        <p>
          Social and advertising connectors are generally <strong>read-only</strong>. Ghost does not
          promise write access to post content, run ads, or message users on your behalf unless a
          specific feature explicitly says so.
        </p>

        <h2>5. Data and privacy</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we process personal and
          organisation data. You represent that you have the right to connect provider accounts and
          to process any imported data under applicable law.
        </p>

        <h2>6. Intellectual property</h2>
        <p>
          Ghost Core software, branding, and documentation remain ours or our licensors’. You retain
          rights to your content and provider data. You grant us a limited licence to host and
          process that data solely to provide the Service.
        </p>

        <h2>7. Beta / early access</h2>
        <p>
          The Service may be offered in early access. Features may be incomplete, change without
          notice, or contain errors. Use production data at your own risk during early access.
        </p>

        <h2>8. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EXPRESS
          OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. Insights and correlations are deterministic heuristics, not professional
          advice or guarantees of business outcomes.
        </p>

        <h2>9. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, GHOST CORE AND ITS OPERATORS WILL NOT BE LIABLE
          FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST
          PROFITS, REVENUE, DATA, OR GOODWILL. TOTAL LIABILITY FOR CLAIMS RELATING TO THE SERVICE IS
          LIMITED TO THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE THREE MONTHS BEFORE THE CLAIM
          (OR ZERO IF THE SERVICE WAS FREE).
        </p>

        <h2>10. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access for breach
          of these Terms, risk to the platform, or legal requirements. On termination, access to the
          workspace may end; provider tokens should be disconnected.
        </p>

        <h2>11. Changes</h2>
        <p>
          We may update these Terms. Continued use after the updated date constitutes acceptance.
          Material changes may be highlighted in-product when practical.
        </p>

        <h2>12. Governing law</h2>
        <p>
          Unless mandatory local law says otherwise, these Terms are governed by the laws of
          England and Wales, and courts there have exclusive jurisdiction, without prejudice to
          consumer protections that cannot be waived.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these Terms: contact the Ghost Core operator via the support channel
          listed on the Service.
        </p>

        <p className="not-prose mt-10">
          <Link className="button button-secondary" href="/privacy">
            Privacy Policy
          </Link>
        </p>
      </article>
    </main>
  );
}
