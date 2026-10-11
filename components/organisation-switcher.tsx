"use client";
import {roleLabel} from "@/lib/ui/labels";
import {useState} from "react";
import {switchOrganisation} from "@/app/organisation-actions";
export function OrganisationSwitcher({
  activeId,
  organisations,
}: {
  activeId: string;
  organisations: {id: string; name: string; role: string}[];
}) {
  const [loading, setLoading] = useState(false);
  return (
    <form action={switchOrganisation} onSubmit={() => setLoading(true)}>
      <label className="sr-only" htmlFor="organisation-switcher">
        Active organisation
      </label>
      <select
        id="organisation-switcher"
        name="organisationId"
        className="w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm font-medium text-white outline-none focus:border-spark [&>option]:text-zinc-900"
        value={activeId}
        disabled={loading}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {organisations.map((org) => (
          <option value={org.id} key={org.id}>
            {`${org.name} · ${roleLabel(org.role)}`}
          </option>
        ))}
      </select>
      {loading && <p className="mt-1 text-xs text-white/50">Switching workspace…</p>}
    </form>
  );
}
