import Link from "next/link";
import {ArrowRight, Plug, RefreshCw, Sparkles} from "lucide-react";

const steps = [
  {
    icon: Plug,
    title: "Connect a tool",
    body: "Shopify, Stripe, Google Analytics, Meta Ads, Gmail and more. Read-only, and takes about a minute.",
  },
  {
    icon: RefreshCw,
    title: "Metric Mage imports your activity",
    body: "The first sync starts straight away, then keeps itself up to date automatically.",
  },
  {
    icon: Sparkles,
    title: "See what needs you",
    body: "This page fills with this week's numbers, anything that needs fixing, and what Metric Mage noticed.",
  },
];

/** Shown on Home until the organisation has connected its first tool. */
export function GettingStarted() {
  return (
    <section className="overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-indigo-50/60 p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
        Let&apos;s get your first tool connected
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Metric Mage needs something to watch before it can tell you what&apos;s happening.
      </p>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map(({icon: Icon, title, body}, i) => (
          <li key={title} className="rounded-2xl border border-white/80 bg-white/80 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700">
                <Icon aria-hidden className="h-[18px] w-[18px]" />
              </span>
              <span className="text-xs font-medium text-zinc-400">Step {i + 1}</span>
            </div>
            <p className="mt-3 font-medium text-zinc-900">{title}</p>
            <p className="mt-1 text-sm text-zinc-600">{body}</p>
          </li>
        ))}
      </ol>
      <Link href="/welcome" className="button mt-6">
        Connect a tool
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
    </section>
  );
}
