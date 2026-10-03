import {caseCategories, workPriorities} from "@/lib/work/types";
import {createCaseAction, createTaskAction} from "@/app/work-actions";
type Member = {user_id: string; label: string};
type Props = {
  kind: "task" | "case";
  members: Member[];
  cases?: {id: string; case_number: string; title: string}[];
  sourceType?: string;
  sourceId?: string;
};
export function WorkForm({kind, members, cases = [], sourceType = "manual", sourceId = ""}: Props) {
  const action = kind === "task" ? createTaskAction : createCaseAction;
  return (
    <form action={action} className="card grid gap-4 md:grid-cols-2">
      <label className="md:col-span-2">
        Title
        <input className="field mt-1 w-full" name="title" required maxLength={200} />
      </label>
      {kind === "case" && (
        <label className="md:col-span-2">
          Summary
          <input className="field mt-1 w-full" name="summary" maxLength={1000} />
        </label>
      )}
      <label className="md:col-span-2">
        Description
        <textarea className="field mt-1 min-h-32 w-full" name="description" maxLength={10000} />
      </label>
      <label>
        Priority
        <select className="field mt-1 w-full" name="priority" defaultValue="normal">
          {workPriorities.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      {kind === "case" ? (
        <label>
          Category
          <select className="field mt-1 w-full" name="category" defaultValue="operational">
            {caseCategories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Due date
          <input className="field mt-1 w-full" name="dueAt" type="datetime-local" />
        </label>
      )}
      <label>
        Assignee
        <select className="field mt-1 w-full" name="assignedUserId">
          <option value="">Unassigned</option>
          {members.map((x) => (
            <option key={x.user_id} value={x.user_id}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">Who&apos;s doing the work.</span>
      </label>
      <label>
        Owner
        <select className="field mt-1 w-full" name="ownerUserId">
          <option value="">No owner</option>
          {members.map((x) => (
            <option key={x.user_id} value={x.user_id}>
              {x.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">
          Who makes sure it gets done, if that&apos;s someone else.
        </span>
      </label>
      {kind === "task" && (
        <>
          <label>
            Case <span className="text-zinc-400">(optional)</span>
            <select className="field mt-1 w-full" name="caseId">
              <option value="">Not part of a case</option>
              {cases.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.case_number} · {x.title}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              A case groups tasks about one bigger issue, like a customer complaint or an outage.
            </span>
          </label>
          <label>
            Estimate (minutes)
            <input className="field mt-1 w-full" name="estimatedMinutes" type="number" min="0" />
          </label>
        </>
      )}
      {/* Filled in when the item is created from an alert or automation; not something to edit. */}
      <input type="hidden" name="sourceType" value={sourceType} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <button className="button md:col-span-2">Create {kind}</button>
    </form>
  );
}
