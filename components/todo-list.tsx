import {addTodo, setTodoPeople, setTodoStatus} from "@/app/todo-actions";
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
}: {
  items: TodoItem[];
  scope: "all" | "one";
  period: Period;
  teams: Team[];
  currentUserId: string;
}) {
  const sorted = [...items].sort((a, b) => {
    const rank = {in_progress: 0, open: 1, completed: 2};
    return rank[todoChoice(a.status)] - rank[todoChoice(b.status)] || a.title.localeCompare(b.title);
  });
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80" aria-label="To do">
      <div className="border-b-4 border-[#579bfc] px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-950">To do</h2>
        <p className="text-xs text-zinc-500">Everyone on the team can see this list.</p>
      </div>
      {sorted.length ? (
        <ul>
          {sorted.map((task) => {
            const current = todoChoice(task.status);
            return (
              <li key={task.id} className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm text-zinc-900 ${current === "completed" ? "line-through decoration-zinc-300" : ""}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {[task.assigneeLabel, task.organisationName].filter(Boolean).join(" · ")}
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500">Who</summary>
                    <form action={setTodoPeople} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <input type="hidden" name="scope" value={scope} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="organisationId" value={task.organisationId} />
                      <input type="hidden" name="id" value={task.id} />
                      {(teams.find((team) => team.id === task.organisationId)?.people ?? []).map((person) => (
                        <label key={person.userId} className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            name="assignee"
                            value={person.userId}
                            defaultChecked={task.assigneeIds.includes(person.userId)}
                          />
                          {person.label}
                        </label>
                      ))}
                      <button className="button-ghost px-2 py-1 text-xs">Save</button>
                    </form>
                  </details>
                </div>
                <form action={setTodoStatus} className="flex flex-wrap gap-1">
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
                      className="rounded px-2 py-1 text-xs font-semibold"
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
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-zinc-500">Nothing on the list yet.</p>
      )}
      <form action={addTodo} className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3">
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
        <TodoWho groups={teams} currentUserId={currentUserId} showProject={teams.length > 1} />
      </form>
    </section>
  );
}
