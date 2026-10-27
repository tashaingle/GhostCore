"use client";

import {useState} from "react";

type Person = {userId: string; label: string};
type Group = {id: string; name: string; people: Person[]};

export function TodoWho({
  groups,
  currentUserId,
  showProject,
}: {
  groups: Group[];
  currentUserId: string;
  showProject: boolean;
}) {
  const [organisationId, setOrganisationId] = useState(groups[0]?.id ?? "");
  const people = [...(groups.find((group) => group.id === organisationId)?.people ?? [])].sort(
    (a, b) =>
      Number(b.userId === currentUserId) - Number(a.userId === currentUserId) ||
      a.label.localeCompare(b.label),
  );
  return (
    <>
      {showProject ? (
        <select
          name="organisationId"
          className="field sm:max-w-48"
          value={organisationId}
          onChange={(event) => setOrganisationId(event.target.value)}
          aria-label="Project"
          required
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="organisationId" value={organisationId} />
      )}
      <fieldset key={organisationId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <legend className="sr-only">Who needs to do this</legend>
        {people.map((person) => (
          <label key={person.userId} className="inline-flex items-center gap-1.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="assignee"
              value={person.userId}
              defaultChecked={person.userId === currentUserId}
            />
            {person.label}
          </label>
        ))}
      </fieldset>
    </>
  );
}
