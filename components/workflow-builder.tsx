"use client";
import {useState} from "react";
import {workflowStepTypes, type StepInput} from "@/lib/workflows/types";
import {ROLE_OPTIONS, STEP_TYPES} from "@/lib/workflows/describe";
const initial: StepInput[] = [
  {
    name: "Ask an admin to approve",
    type: "approval",
    configuration: {dueHours: 24},
    assignedRole: "admin",
    timeoutSeconds: 300,
    maxRetries: 0,
    failurePolicy: "fail",
  },
  {
    name: "Finish",
    type: "complete",
    configuration: {},
    timeoutSeconds: 300,
    maxRetries: 0,
    failurePolicy: "fail",
  },
];
/** Steps where a person has to do something, so "who" and "how long" matter. */
const PEOPLE_STEPS = new Set(["task", "approval", "manual_confirmation"]);
const DUE_STEPS = new Set(["task", "approval"]);

export function WorkflowBuilder({defaultSteps = initial}: {defaultSteps?: StepInput[]}) {
  const [steps, setSteps] = useState(defaultSteps),
    [drag, setDrag] = useState<number | null>(null),
    update = (index: number, patch: Partial<StepInput>) =>
      setSteps((x) => x.map((s, i) => (i === index ? {...s, ...patch} : s))),
    configure = (index: number, patch: Record<string, unknown>) =>
      setSteps((x) =>
        x.map((s, i) => (i === index ? {...s, configuration: {...s.configuration, ...patch}} : s)),
      ),
    move = (from: number, to: number) =>
      setSteps((x) => {
        if (to < 0 || to >= x.length) return x;
        const copy = [...x],
          [item] = copy.splice(from, 1);
        copy.splice(to, 0, item);
        return copy;
      });
  return (
    <div className="space-y-3">
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <div>
        <h2 className="font-semibold">Then do these steps, in order</h2>
        <p className="text-sm text-zinc-500">
          Each step waits for the one before it to finish. Drag a step, or use the arrows, to change
          the order.
        </p>
      </div>
      {steps.map((step, index) => (
        <article
          className="card space-y-3"
          draggable
          onDragStart={() => setDrag(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag !== null && drag !== index) move(drag, index);
            setDrag(null);
          }}
          key={index}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="cursor-move font-semibold">
              <span aria-hidden>↕ </span>Step {index + 1}
            </span>
            <span className="flex gap-1 text-sm">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Move step ${index + 1} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                disabled={index === steps.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Move step ${index + 1} down`}
              >
                ↓
              </button>
              <button
                className="rounded-lg px-2 py-1 text-red-700 hover:bg-red-50"
                type="button"
                onClick={() => setSteps((x) => x.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              What should happen?
              <select
                className="field mt-1 w-full"
                value={step.type}
                onChange={(e) => update(index, {type: e.target.value as StepInput["type"]})}
              >
                {workflowStepTypes.map((x) => (
                  <option key={x} value={x}>
                    {STEP_TYPES[x].label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-zinc-500">{STEP_TYPES[step.type].hint}</span>
            </label>
            <label>
              Name this step
              <input
                className="field mt-1 w-full"
                value={step.name}
                onChange={(e) => update(index, {name: e.target.value})}
              />
              {PEOPLE_STEPS.has(step.type) ? (
                <span className="mt-1 block text-xs text-zinc-500">
                  This is what people see on the task or approval.
                </span>
              ) : null}
            </label>
            {PEOPLE_STEPS.has(step.type) ? (
              <label>
                Who?
                <select
                  className="field mt-1 w-full"
                  value={step.assignedRole ?? ""}
                  onChange={(e) => update(index, {assignedRole: e.target.value || null})}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {DUE_STEPS.has(step.type) ? (
              <label>
                {step.type === "approval" ? "Answer needed within (hours)" : "Due within (hours)"}
                <input
                  className="field mt-1 w-full"
                  type="number"
                  min="1"
                  value={Number(step.configuration.dueHours ?? 24)}
                  onChange={(e) => configure(index, {dueHours: Number(e.target.value)})}
                />
              </label>
            ) : null}
            {step.type === "delay" ? (
              <label>
                Wait for (minutes)
                <input
                  className="field mt-1 w-full"
                  type="number"
                  min="1"
                  value={Math.max(1, Math.round(Number(step.configuration.seconds ?? 60) / 60))}
                  onChange={(e) => configure(index, {seconds: Number(e.target.value) * 60})}
                />
              </label>
            ) : null}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-500">Advanced settings</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label>
                If this step fails
                <select
                  className="field mt-1 w-full"
                  value={step.failurePolicy ?? "fail"}
                  onChange={(e) =>
                    update(index, {failurePolicy: e.target.value as StepInput["failurePolicy"]})
                  }
                >
                  <option value="fail">Stop the automation</option>
                  <option value="continue">Carry on to the next step</option>
                  <option value="pause">Pause until someone looks</option>
                </select>
              </label>
              <label>
                Try again this many times
                <input
                  className="field mt-1 w-full"
                  type="number"
                  min="0"
                  max="10"
                  value={step.maxRetries ?? 3}
                  onChange={(e) => update(index, {maxRetries: Number(e.target.value)})}
                />
              </label>
              <label>
                Give up after (seconds)
                <input
                  className="field mt-1 w-full"
                  type="number"
                  min="10"
                  value={step.timeoutSeconds ?? 300}
                  onChange={(e) => update(index, {timeoutSeconds: Number(e.target.value)})}
                />
              </label>
              <label className="md:col-span-3">
                Step settings (for technical use)
                <textarea
                  className="field mt-1 min-h-24 w-full font-mono text-xs"
                  defaultValue={JSON.stringify(step.configuration, null, 2)}
                  key={JSON.stringify(step.configuration)}
                  onBlur={(e) => {
                    try {
                      update(index, {configuration: JSON.parse(e.target.value)});
                    } catch {}
                  }}
                />
              </label>
            </div>
          </details>
        </article>
      ))}
      <button
        className="button button-secondary"
        type="button"
        onClick={() =>
          setSteps((x) => [
            ...x,
            {
              name: "New task",
              type: "task",
              configuration: {dueHours: 24},
              timeoutSeconds: 300,
              maxRetries: 3,
              failurePolicy: "fail",
            },
          ])
        }
      >
        Add a step
      </button>
    </div>
  );
}
