"use client";
import {useFormStatus} from "react-dom";

/** A submit button that disables itself while its form is submitting, preventing double submits. */
export function SubmitButton({
  children,
  pendingLabel,
  className = "button",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const {pending} = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      title={title}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
