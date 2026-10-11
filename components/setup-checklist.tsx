"use client";
import {useSyncExternalStore} from "react";
import Link from "next/link";
import {Check, ArrowRight} from "lucide-react";

export type SetupStep = {key: string; title: string; body: string; href: string; done: boolean};

const CHANGED = "metric-mage-setup-hidden";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}
function readHidden(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A short "get the most out of Metric Mage" list for new organisations. Steps tick themselves off
 * from real data; it disappears once everything's done, or when hidden (remembered per device).
 */
export function SetupChecklist({
  organisationId,
  steps,
}: {
  organisationId: string;
  steps: SetupStep[];
}) {
  const storageKey = `metric-mage-setup-hidden:${organisationId}`;
  // Hidden on the server and until the browser has checked, so it never flashes then vanishes.
  const hidden = useSyncExternalStore(
    subscribe,
    () => readHidden(storageKey),
    () => true,
  );
  const done = steps.filter((s) => s.done).length,
    next = steps.find((s) => !s.done);
  if (hidden || !next) return null;

  const hide = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <section
      aria-labelledby="setup-heading"
      className="rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-sky-50/60 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-heading" className="font-semibold text-zinc-950">
            Get the most out of Metric Mage
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600">{`${done} of ${steps.length} done`}</p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-white hover:text-zinc-900"
        >
          Hide
        </button>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-violet-600 transition-[width] duration-700"
          style={{width: `${(done / steps.length) * 100}%`}}
        />
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={`flex h-full items-start gap-3 rounded-2xl border p-3.5 transition-colors ${
                step.done
                  ? "border-transparent bg-white/50"
                  : step === next
                    ? "border-violet-200 bg-white shadow-sm hover:border-violet-300"
                    : "border-white/80 bg-white/80 hover:border-violet-200"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  step.done ? "bg-emerald-500 text-white" : "border-2 border-violet-300"
                }`}
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium ${step.done ? "text-zinc-400 line-through" : "text-zinc-900"}`}
                >
                  {step.title}
                  <span className="sr-only">{step.done ? " (done)" : ""}</span>
                </span>
                {!step.done ? (
                  <span className="mt-0.5 block text-sm text-zinc-600">{step.body}</span>
                ) : null}
              </span>
              {!step.done ? (
                <ArrowRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
