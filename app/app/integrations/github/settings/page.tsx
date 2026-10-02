import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {githubAppEnv, manageUrl} from "@/lib/integrations/github/app";
import {
  installationRepositories,
  MAX_SELECTED_REPOSITORIES,
  selectedRepositories,
} from "@/lib/integrations/github/repositories";
import {saveGitHubRepositories} from "@/app/github-actions";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";

export default async function GitHubSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: item} = await ctx.supabase
    .from("integrations")
    .select("settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "github")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const settings = (item?.settings ?? {}) as Record<string, unknown>,
    installationId = typeof settings.installationId === "string" ? settings.installationId : null,
    env = githubAppEnv();

  let available: string[] = [],
    error: string | null = null;
  if (installationId && env) {
    try {
      available = await installationRepositories(env, installationId);
    } catch {
      error = "Ghost couldn't reach GitHub to list your repositories. Refresh to try again.";
    }
  }
  const selection = selectedRepositories(settings),
    // Older connections with no saved choice track everything; show that as all ticked.
    isTracked = (r: string) => (selection ? selection.includes(r) : true),
    githubLink = installationId
      ? manageUrl(
          settings.accountType as string | undefined,
          settings.accountLogin as string | undefined,
          installationId,
        )
      : null;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="GitHub repositories"
        description={`Choose which repositories ${ctx.organisation.name} tracks. Each organisation keeps its own choice, even when they share a GitHub account.`}
      />
      <Notice searchParams={params} />
      {!installationId ? (
        <div className="card space-y-3">
          <p>Connect GitHub to choose repositories.</p>
          <Link className="button" href="/api/integrations/github/connect">
            Connect GitHub
          </Link>
        </div>
      ) : (
        <form action={saveGitHubRepositories} className="space-y-3">
          {error && <p className="error">{error}</p>}
          {!error && !available.length && (
            <div className="card">
              Ghost Core can&apos;t see any repositories on{" "}
              {String(settings.accountLogin ?? "GitHub")} yet. Use the link below to give it access
              to some.
            </div>
          )}
          {available.map((repository) => (
            <label className="card flex items-center gap-3" key={repository}>
              <input
                type="checkbox"
                name="repository"
                value={repository}
                defaultChecked={isTracked(repository)}
              />
              <span>
                <strong>{repository.split("/")[1]}</strong>
                <span className="block text-sm text-zinc-500">{repository}</span>
              </span>
            </label>
          ))}
          {available.length > MAX_SELECTED_REPOSITORIES && (
            <p className="text-sm text-zinc-500">
              You can track up to {MAX_SELECTED_REPOSITORIES} repositories per organisation.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {available.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
            {githubLink && (
              <a
                className="button button-secondary"
                href={githubLink}
                target="_blank"
                rel="noreferrer"
              >
                Missing a repository? Add it on GitHub
              </a>
            )}
          </div>
          <p className="text-sm text-zinc-500">
            After adding a repository on GitHub, come back to this tab and refresh the page.
            Repositories you add on GitHub are visible to every Ghost organisation using that GitHub
            account, but each organisation only tracks the ones it ticks here.
          </p>
        </form>
      )}
    </section>
  );
}
