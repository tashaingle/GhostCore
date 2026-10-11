import Link from "next/link";
import {CircleCheck, Loader2, Settings2} from "lucide-react";
import {ProviderMark} from "@/components/home-ui";
import type {ConnectionStatus} from "@/lib/home/connections";

/**
 * Shown while a new organisation's tools do their first import, so Home isn't a page of empty
 * figures. The page refreshes itself (AutoRefresh) until the data arrives.
 */
export function FirstSync({
  connections,
}: {
  connections: (ConnectionStatus & {provider: string; synced: boolean})[];
}) {
  const waiting = connections.filter((c) => !c.synced),
    names = connections.map((c) => c.name),
    list =
      names.length <= 2
        ? names.join(" and ")
        : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return (
    <section
      aria-live="polite"
      className="rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-violet-50/60 p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        </span>
        <div>
          <h2 className="font-semibold text-zinc-950">{`Bringing in your data from ${list}`}</h2>
          <p className="text-sm text-zinc-600">
            The first import usually takes a few minutes. This page updates by itself, and your
            numbers will appear here as soon as they arrive.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {connections.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-3.5 py-2.5 text-sm"
          >
            <ProviderMark provider={c.provider} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{c.name}</span>
            {c.synced ? (
              <span className="flex items-center gap-1 text-emerald-700">
                <CircleCheck aria-hidden className="h-4 w-4" /> Done
              </span>
            ) : c.state === "setup" && c.action ? (
              <Link
                href={c.action.href}
                className="flex items-center gap-1 font-medium text-violet-700 hover:underline"
              >
                <Settings2 aria-hidden className="h-4 w-4" /> Choose what to import
              </Link>
            ) : (
              <span className="text-zinc-500">Importing…</span>
            )}
          </li>
        ))}
      </ul>
      {waiting.some((c) => c.state === "setup") ? (
        <p className="mt-3 text-sm text-zinc-600">
          Some tools need you to choose what to import (like which shop or website) before they can
          start.
        </p>
      ) : null}
    </section>
  );
}
