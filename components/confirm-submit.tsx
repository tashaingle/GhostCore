"use client";
import {useState} from "react";
import {useFormStatus} from "react-dom";

/**
 * A destructive button that asks first. The first click shows the question with "Yes" and "Keep";
 * only "Yes" submits the surrounding form, with this button's name and value.
 */
export function ConfirmSubmit({
  label,
  question,
  confirmLabel,
  name,
  value,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  name?: string;
  value?: string;
}) {
  const [asking, setAsking] = useState(false);
  const {pending} = useFormStatus();

  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        {label}
      </button>
    );

  return (
    <span
      role="alertdialog"
      aria-label={question}
      className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm"
    >
      <span className="text-red-900">{question}</span>
      <button
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        autoFocus
        className="rounded-md bg-red-700 px-3 py-1 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Working…" : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        disabled={pending}
        className="rounded-md px-2 py-1 font-medium text-zinc-700 hover:bg-white"
      >
        Keep
      </button>
    </span>
  );
}
