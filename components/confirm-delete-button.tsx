"use client";

import {Trash2} from "lucide-react";

export function ConfirmDeleteButton({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      onClick={(event) => {
        if (!window.confirm(`${label}? This cannot be undone.`)) event.preventDefault();
      }}
      className={`inline-flex items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 ${compact ? "h-8 w-8" : "gap-1.5 px-2.5 py-1.5 text-xs font-semibold"}`}
    >
      <Trash2 aria-hidden className="h-4 w-4" />
      {compact ? null : "Delete"}
    </button>
  );
}
