import {taskStatuses, caseStatuses, workPriorities, workSourceTypes} from "@/lib/work/types";
import {workPriorityLabel, workSourceLabel, workStatusLabel} from "@/lib/ui/work-labels";
export function WorkFilters({
  kind,
  values,
}: {
  kind: "task" | "case" | "unified";
  values: Record<string, string>;
}) {
  return (
    <form className="card grid gap-2 md:grid-cols-3 xl:grid-cols-7">
      <label className="sr-only" htmlFor="work-q">
        Search work
      </label>
      <input
        id="work-q"
        className="field"
        name="q"
        defaultValue={values.q}
        placeholder="Search work"
      />
      <select aria-label="Status" className="field" name="status" defaultValue={values.status}>
        <option value="">All statuses</option>
        {(kind === "case" ? caseStatuses : taskStatuses).map((x) => (
          <option key={x} value={x}>
            {workStatusLabel(x)}
          </option>
        ))}
      </select>
      <select
        aria-label="Priority"
        className="field"
        name="priority"
        defaultValue={values.priority}
      >
        <option value="">All priorities</option>
        {workPriorities.map((x) => (
          <option key={x} value={x}>
            {workPriorityLabel(x)}
          </option>
        ))}
      </select>
      <select aria-label="Source" className="field" name="source" defaultValue={values.source}>
        <option value="">Wherever it came from</option>
        {workSourceTypes.map((x) => (
          <option key={x} value={x}>
            {workSourceLabel(x)}
          </option>
        ))}
      </select>
      <select
        aria-label="Assignment"
        className="field"
        name="assignment"
        defaultValue={values.assignment}
      >
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="unassigned">Unassigned</option>
      </select>
      <select aria-label="Due state" className="field" name="due" defaultValue={values.due}>
        <option value="">All due dates</option>
        <option value="overdue">Overdue</option>
        <option value="soon">Due soon</option>
        <option value="none">No due date</option>
      </select>
      <button className="button">Filter</button>
    </form>
  );
}
