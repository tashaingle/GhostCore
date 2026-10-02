import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {readGitHubChoices} from "@/lib/integrations/github/choices";
import {chooseGitHubInstallation} from "@/app/github-actions";
import {PageHeader} from "@/components/page-header";
import {SubmitButton} from "@/components/submit-button";

/** Shown when the user's GitHub sign-in can see the app on more than one GitHub account. */
export default async function ChooseGitHubAccount() {
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const choices = await readGitHubChoices(ctx.user.id, ctx.organisation.id);
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Which GitHub account?"
        description={`Ghost Core is installed on more than one of your GitHub accounts. Choose the one ${ctx.organisation.name} should use. You'll pick its repositories next.`}
      />
      {!choices ? (
        <div className="card space-y-3">
          <p>This step timed out. Please connect GitHub again.</p>
          <Link className="button" href="/api/integrations/github/connect">
            Connect GitHub
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {choices.installations.map((i) => (
            <form
              action={chooseGitHubInstallation}
              className="card flex items-center justify-between gap-4"
              key={i.id}
            >
              <input type="hidden" name="installationId" value={i.id} />
              <span>
                <strong>{i.login}</strong>
                <span className="block text-sm text-zinc-500">
                  {i.type === "Organization" ? "GitHub organisation" : "Personal GitHub account"}
                </span>
              </span>
              <SubmitButton pendingLabel="Connecting…">Use this account</SubmitButton>
            </form>
          ))}
          <p className="text-sm text-zinc-500">
            Not listed?{" "}
            <Link className="underline" href="/api/integrations/github/connect?install=1">
              Install Ghost Core on another GitHub account
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
