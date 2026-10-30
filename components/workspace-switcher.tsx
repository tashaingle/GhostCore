"use client";
import Link from "next/link";
import {useState} from "react";
import {Layers} from "lucide-react";
import {switchOrganisation} from "@/app/organisation-actions";

/** Switching workspace opens its first business; the home board then shows only that workspace. */
export function WorkspaceSwitcher({
  activeId,
  workspaces,
}: {
  activeId: string;
  workspaces: {id: string; name: string; organisationIds: string[]}[];
}) {
  const [loading, setLoading] = useState(false);
  const active = workspaces.find((workspace) => workspace.id === activeId);
  return (
    <div className="flex items-center gap-2 px-1">
      <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/45" />
      {workspaces.length > 1 ? (
        <form action={switchOrganisation} onSubmit={() => setLoading(true)} className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="workspace-switcher">
            Workspace
          </label>
          <select
            id="workspace-switcher"
            name="organisationId"
            className="w-full truncate rounded-lg border-0 bg-transparent py-1 pl-0 pr-6 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 outline-none hover:text-white focus:ring-1 focus:ring-spark [&>option]:normal-case [&>option]:tracking-normal [&>option]:text-zinc-900"
            value={active?.organisationIds[0] ?? ""}
            disabled={loading}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {workspaces.map((workspace) => (
              <option value={workspace.organisationIds[0]} key={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <p className="min-w-0 flex-1 truncate py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
          {active?.name ?? "Workspace"}
        </p>
      )}
      <Link
        href="/app/workspaces"
        className="shrink-0 text-[11px] text-white/45 transition-colors hover:text-white"
      >
        {loading ? "Switching…" : "Manage"}
      </Link>
    </div>
  );
}
