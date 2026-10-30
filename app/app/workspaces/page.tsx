import Link from "next/link";
import {Layers, Plus} from "lucide-react";
import {switchOrganisation} from "@/app/organisation-actions";
import {moveBusiness, renameWorkspace} from "@/app/workspace-actions";
import {Notice} from "@/components/notice";
import {SubmitButton} from "@/components/submit-button";
import {hasPermission, type OrganisationRole} from "@/lib/auth/permissions";
import {getActiveOrganisation} from "@/lib/organisations/active";

export const metadata = {title: "Workspaces"};

export default async function Workspaces({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getActiveOrganisation();
  const names = new Map(ctx.allOrganisations.map((item) => [item.id, item.name]));
  const canManage = ctx.allOrganisations.some(
    (item) => item.workspaceId === ctx.workspace.id && ["owner", "admin"].includes(item.role),
  );
  const canMove = hasPermission(ctx.membership.role as OrganisationRole, "organisation.edit");
  const others = ctx.workspaces.filter((workspace) => workspace.id !== ctx.workspace.id);
  return (
    <section className="mm-page mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            Workspaces
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-950">
            Keep groups of businesses apart
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your home board, to-do list and projects show one workspace at a time. People only see
            the businesses they&apos;ve been added to.
          </p>
        </div>
        <Link href="/app/workspaces/new" className="button inline-flex items-center gap-1.5">
          <Plus aria-hidden className="h-4 w-4" />
          New workspace
        </Link>
      </header>
      <Notice searchParams={await searchParams} />

      <ul className="grid gap-3 sm:grid-cols-2">
        {ctx.workspaces.map((workspace) => {
          const current = workspace.id === ctx.workspace.id;
          return (
            <li
              key={workspace.id}
              className={`mm-panel rounded-2xl p-4 ${current ? "ring-2 ring-blue-500" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers aria-hidden className="h-4 w-4 text-blue-600" />
                  <h2 className="font-semibold text-zinc-950">{workspace.name}</h2>
                </div>
                {current ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    Current
                  </span>
                ) : (
                  <form action={switchOrganisation}>
                    <input type="hidden" name="organisationId" value={workspace.organisationIds[0]} />
                    <button className="text-sm font-medium text-blue-700 hover:underline">Open</button>
                  </form>
                )}
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                {workspace.organisationIds.map((id) => names.get(id)).join(", ")}
              </p>
              {!workspace.mine ? (
                <p className="mt-1 text-xs text-zinc-400">Shared with you</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canManage ? (
        <form action={renameWorkspace} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="label flex-1">
            Rename {ctx.workspace.name}
            <input
              className="field"
              name="name"
              defaultValue={ctx.workspace.name}
              required
              minLength={2}
              maxLength={60}
            />
          </label>
          <SubmitButton className="button shrink-0" pendingLabel="Saving…">
            Save name
          </SubmitButton>
        </form>
      ) : null}

      {canMove && others.length ? (
        <form action={moveBusiness} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="label flex-1">
            Move {ctx.organisation.name} to
            <select className="field" name="workspaceId" required defaultValue="">
              <option value="" disabled>
                Choose a workspace
              </option>
              {others.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-zinc-500">
              Its people and data stay the same. Switch business in the sidebar to move a different
              one.
            </span>
          </label>
          <SubmitButton className="button-ghost shrink-0" pendingLabel="Moving…">
            Move
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
