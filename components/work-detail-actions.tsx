import {commentAction, workAction} from "@/app/work-actions";
import type {OrganisationRole} from "@/lib/auth/permissions";
import {hasPermission} from "@/lib/auth/permissions";
import {nextCaseStatuses, nextTaskStatuses} from "@/lib/work/status";
import {workStatusLabel} from "@/lib/ui/work-labels";
import {workPermission} from "@/lib/work/permissions";

/** What the button says for moving work to each status. */
const ACTION_LABEL: Record<string, string> = {
  in_progress: "Start",
  completed: "Mark as done",
  blocked: "Blocked",
  waiting: "Waiting on someone",
  investigating: "Start looking into it",
  resolved: "Mark as resolved",
  closed: "Close",
};
const FINISHED = new Set(["completed", "cancelled", "closed"]);

export function WorkDetailActions({
  kind,
  id,
  status,
  role,
  members,
}: {
  kind: "task" | "case";
  id: string;
  status: string;
  role: OrganisationRole;
  members: {user_id: string; label: string}[];
}) {
  const next = (kind === "task" ? nextTaskStatuses(status) : nextCaseStatuses(status)).filter((x) =>
      hasPermission(role, workPermission(kind, x)),
    ),
    reopening = FINISHED.has(status),
    finishing = next.some((x) => x === "completed" || x === "resolved"),
    label = (x: string) =>
      x === "cancelled"
        ? `Cancel ${kind}`
        : (x === "open" || x === "investigating") && reopening
          ? "Reopen"
          : x === "open"
            ? "Back to To do"
            : (ACTION_LABEL[x] ?? workStatusLabel(x));
  return (
    <div className="space-y-4">
      {next.length ? (
        <form action={workAction} className="card space-y-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <div>
            <h3 className="font-semibold">Update this {kind}</h3>
            <p className="text-sm text-zinc-500">{`It's currently "${workStatusLabel(status)}".`}</p>
          </div>
          <label className="block text-sm">
            {reopening ? "Why are you reopening it?" : "Add a note"}{" "}
            {reopening ? null : <span className="text-zinc-400">(optional)</span>}
            <textarea
              className="field mt-1 w-full"
              name="reason"
              required={reopening}
              placeholder={reopening ? "Needed to reopen" : "For example, what you're waiting for"}
            />
          </label>
          {finishing ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500">
                Add what was done and how long it took (optional)
              </summary>
              <label className="mt-2 block">
                What was done?
                <textarea className="field mt-1 w-full" name="summary" />
              </label>
              <label className="mt-2 block">
                Time spent (minutes)
                <input className="field mt-1 w-full" name="actualMinutes" type="number" min="0" />
              </label>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {next.map((x) => (
              <button
                className={
                  x === "completed" || x === "resolved" || x === "in_progress"
                    ? "button"
                    : "button button-secondary"
                }
                key={x}
                name="action"
                value={x}
              >
                {label(x)}
              </button>
            ))}
          </div>
        </form>
      ) : null}
      {hasPermission(role, "work.assign") && (
        <form action={workAction} className="card space-y-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <h3 className="font-semibold">Who&apos;s doing it?</h3>
          <select aria-label="Person" className="field w-full" name="assignedUserId">
            <option value="">Choose someone</option>
            {members.map((x) => (
              <option key={x.user_id} value={x.user_id}>
                {x.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button className="button button-secondary" name="action" value="assign">
              Assign
            </button>
            <button className="button button-secondary" name="action" value="unassign">
              Remove assignee
            </button>
          </div>
        </form>
      )}
      {hasPermission(role, "work.comment") && (
        <form action={commentAction} className="card space-y-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="commentType" value="comment" />
          <label className="block">
            <span className="font-semibold">Add a comment</span>
            <span className="block text-sm text-zinc-500">Everyone on the team can see it.</span>
            <textarea
              className="field mt-2 min-h-24 w-full"
              name="body"
              required
              maxLength={5000}
            />
          </label>
          <button className="button">Post comment</button>
        </form>
      )}
    </div>
  );
}
