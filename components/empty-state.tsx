import Link from "next/link";
import type {ReactNode} from "react";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card text-center sm:text-left">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-xl text-sm text-zinc-600">{description}</p>
      {children}
      {actionHref && actionLabel ? (
        <Link className="button mt-4" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
