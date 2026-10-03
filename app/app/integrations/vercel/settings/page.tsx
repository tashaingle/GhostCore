import Link from "next/link";
import {getActiveOrganisation} from "@/lib/organisations/active";
import {requireOrganisationAdmin} from "@/lib/auth/organisation-admin";
import {VercelClient} from "@/lib/integrations/vercel/client";
import {VERCEL_LIMITS} from "@/lib/integrations/vercel/config";
import {selectedVercelProjects} from "@/lib/integrations/vercel/connector";
import {saveVercelProjects} from "@/app/vercel-actions";
import {decryptToken} from "@/lib/security/token-crypto";
import {PageHeader} from "@/components/page-header";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import type {VercelProject} from "@/lib/integrations/vercel/types";

export default async function VercelSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await getActiveOrganisation();
  if (!ctx) return null;
  requireOrganisationAdmin(ctx.membership.role);
  const {data: items} = await ctx.supabase
    .from("integrations")
    .select("id,provider_account_name,access_token_encrypted,settings")
    .eq("organisation_id", ctx.organisation.id)
    .eq("provider", "vercel")
    .order("created_at");

  const accounts = await Promise.all(
    (items ?? []).map(async (item) => {
      const settings = (item.settings ?? {}) as Record<string, unknown>,
        teamId = typeof settings.teamId === "string" ? settings.teamId : null,
        selected = new Set(selectedVercelProjects(settings));
      let projects: VercelProject[] = [],
        error: string | null = null;
      if (!item.access_token_encrypted) error = "Reconnect Vercel to choose projects.";
      else {
        try {
          projects = await new VercelClient(decryptToken(item.access_token_encrypted)).projects(
            teamId,
          );
        } catch {
          error = "Metric Mage couldn't reach Vercel to list your projects. Refresh to try again.";
        }
      }
      return {item, projects, error, selected};
    }),
  );

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-zinc-500" href="/app/integrations">
        ← Connections
      </Link>
      <PageHeader
        title="Vercel projects"
        description={`Choose which projects ${ctx.organisation.name} watches. Metric Mage reads deploys only. It never creates, cancels or changes a deployment.`}
      />
      <Notice searchParams={params} />
      {!accounts.length ? (
        <div className="card space-y-3">
          <p>Connect Vercel to choose projects.</p>
          <Link className="button" href="/api/integrations/vercel/connect">
            Connect Vercel
          </Link>
        </div>
      ) : (
        accounts.map(({item, projects, error, selected}) => (
          <form action={saveVercelProjects} className="space-y-3" key={item.id}>
            <input type="hidden" name="integrationId" value={item.id} />
            <h2 className="text-lg font-semibold text-zinc-950">
              {item.provider_account_name || "Vercel account"}
            </h2>
            {error && <p className="error">{error}</p>}
            {!error && !projects.length && (
              <div className="card">
                Metric Mage can&apos;t see any projects on this account yet. Grant access to some on
                Vercel, then refresh this page.
              </div>
            )}
            {projects.map((project) => (
              <label className="card flex items-center gap-3" key={project.id}>
                <input
                  type="checkbox"
                  name="project"
                  value={project.id}
                  defaultChecked={selected.has(project.id)}
                />
                <span>
                  <strong>{project.name}</strong>
                  {project.framework ? (
                    <span className="block text-sm text-zinc-500">{project.framework}</span>
                  ) : null}
                </span>
              </label>
            ))}
            {projects.length > VERCEL_LIMITS.maxSelectedProjects && (
              <p className="text-sm text-zinc-500">
                You can watch up to {VERCEL_LIMITS.maxSelectedProjects} projects per organisation.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {projects.length > 0 && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
              <Link className="button button-secondary" href="/api/integrations/vercel/connect">
                Project missing? Grant access on Vercel
              </Link>
            </div>
          </form>
        ))
      )}
    </section>
  );
}
