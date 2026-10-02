"use client";
import {useFormStatus} from "react-dom";

/** A submit button that disables itself while its form is submitting, preventing double submits. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "button",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const {pending} = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
