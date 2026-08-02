import Link from "next/link";

type Step = {
  title: string;
  body: string;
  href: string;
  label: string;
  done?: boolean;
};

export function GettingStarted({
  connectedCount,
  eventCount,
  insightCount,
}: {
  connectedCount: number;
  eventCount: number;
  insightCount: number;
}) {
  const steps: Step[] = [
    {
      title: "Connect your tools",
      body: "Link Stripe, Shopify, GitHub, Google, Slack, or others so Ghost can watch what changes.",
      href: "/app/integrations",
      label: connectedCount > 0 ? "Manage integrations" : "Connect a tool",
      done: connectedCount > 0,
    },
    {
      title: "Sync activity",
      body: "Run Sync on each connected tool. Ghost turns raw activity into a single timeline.",
      href: "/app/integrations",
      label: "Open integrations",
      done: eventCount > 0,
    },
    {
      title: "Review insights",
      body: "Ghost highlights risks and changes that need attention — with evidence, not guesswork.",
      href: "/app/timeline?view=insights",
      label: insightCount > 0 ? "View insights" : "Open timeline",
      done: insightCount > 0,
    },
  ];

  const complete = steps.every((step) => step.done);
  if (complete) return null;

  return (
    <section className="card space-y-4 border-violet-200 bg-gradient-to-br from-violet-50 to-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Getting started
        </p>
        <h3 className="mt-1 text-xl font-bold">Set up Ghost in a few minutes</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Connect tools, sync data, then review what needs attention.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`rounded-xl border p-4 ${step.done ? "border-green-200 bg-green-50/50" : "border-zinc-200 bg-white"}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${step.done ? "bg-green-600 text-white" : "bg-zinc-900 text-white"}`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <strong className="text-sm">{step.title}</strong>
            </div>
            <p className="mt-2 text-sm text-zinc-600">{step.body}</p>
            <Link className="button button-secondary mt-3 text-sm" href={step.href}>
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
