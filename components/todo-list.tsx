import {addTodo, deleteTodo, setTodoPeople, setTodoStatus} from "@/app/todo-actions";
import {ConfirmDeleteButton} from "@/components/confirm-delete-button";
import {TodoWho} from "@/components/todo-who";
import {TODO_CHOICES, todoChoice} from "@/lib/home/todo";
import type {Period} from "@/lib/home/performance";

type Person = {userId: string; label: string};
type Team = {id: string; name: string; people: Person[]};

export type TodoItem = {
  id: string;
  title: string;
  status: string;
  organisationId: string;
  organisationName?: string;
  assigneeIds: string[];
  assigneeLabel: string;
};

export function TodoList({
  items,
  scope,
  period,
  teams,
  currentUserId,
  compact = false,
}: {
  items: TodoItem[];
  scope: "all" | "one";
  period: Period;
  teams: Team[];
  currentUserId: string;
  compact?: boolean;
}) {
  const sorted = [...items].sort((a, b) => {
    const rank = {in_progress: 0, open: 1, completed: 2};
    return (
      rank[todoChoice(a.status)] - rank[todoChoice(b.status)] || a.title.localeCompare(b.title)
    );
  });
  return (
    <section
      className={`mm-panel overflow-hidden ${compact ? "rounded-2xl" : "rounded-2xl"}`}
      aria-label="To do"
    >
      <div
        className={`border-b border-zinc-100 ${compact ? "px-4 py-4" : "px-5 py-4"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
              Shared list
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-zinc-950">Tasks</h2>
          </div>
          {compact ? (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              {sorted.filter((task) => todoChoice(task.status) !== "completed").length}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <p className="text-xs text-zinc-500">Everyone on the team can see this list.</p>
        ) : null}
      </div>
      {sorted.length ? (
        <ul>
          {sorted.slice(0, compact ? 6 : undefined).map((task) => {
            const current = todoChoice(task.status);
            return (
              <li
                key={task.id}
                className={`flex flex-wrap items-center gap-3 border-t border-zinc-100 px-5 transition-colors hover:bg-zinc-50/70 ${compact ? "py-3" : "py-3.5"}`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium text-zinc-900 ${current === "completed" ? "line-through decoration-zinc-300 text-zinc-400" : ""}`}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {[task.assigneeLabel, task.organisationName].filter(Boolean).join(" · ")}
                  </p>
                  <details className={compact ? "hidden" : "mt-1"}>
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500">
                      Who
                    </summary>
                    <form
                      action={setTodoPeople}
                      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <input type="hidden" name="scope" value={scope} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="organisationId" value={task.organisationId} />
                      <input type="hidden" name="id" value={task.id} />
                      {(teams.find((team) => team.id === task.organisationId)?.people ?? []).map(
                        (person) => (
                          <label
                            key={person.userId}
                            className="inline-flex items-center gap-1.5 text-xs text-zinc-700"
                          >
                            <input
                              type="checkbox"
                              name="assignee"
                              value={person.userId}
                              defaultChecked={task.assigneeIds.includes(person.userId)}
                            />
                            {person.label}
                          </label>
                        ),
                      )}
                      <button className="button-ghost px-2 py-1 text-xs">Save</button>
                    </form>
                  </details>
                </div>
                <form
                  action={setTodoStatus}
                  className={`flex flex-wrap gap-1 ${compact ? "w-full" : ""}`}
                >
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="organisationId" value={task.organisationId} />
                  <input type="hidden" name="id" value={task.id} />
                  {TODO_CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      name="status"
                      value={choice.value}
                      aria-current={choice.value === current ? "true" : undefined}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-transform active:scale-95 ${compact ? "flex-1" : ""}`}
                      style={
                        choice.value === current
                          ? {background: choice.colour, color: "#fff"}
                          : {background: "#f4f4f5", color: "#52525b"}
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                </form>
                <form action={deleteTodo}>
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="organisationId" value={task.organisationId} />
                  <input type="hidden" name="id" value={task.id} />
                  <ConfirmDeleteButton label={`Delete ${task.title}`} compact={compact} />
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-zinc-500">Nothing on the list yet.</p>
      )}
      <form action={addTodo} className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50/60 px-5 py-4">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="period" value={period} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`todo-title-${scope}`}>
            Add a to do
          </label>
          <input
            id={`todo-title-${scope}`}
            className="field"
            name="title"
            maxLength={200}
            placeholder="+ Add a to do"
            required
          />
          <button className="button shrink-0">Add</button>
        </div>
        <TodoWho
          groups={teams}
          currentUserId={currentUserId}
          showProject={teams.length > 1}
          compact={compact}
        />
      </form>
    </section>
  );
}
