import Link from "next/link";
import {Bell, Plug, Sparkles} from "lucide-react";

const points = [
  {
    icon: Plug,
    title: "Connect the tools you already use",
    body: "Shopify, Stripe, Google, Meta, Slack and more. Read-only, so Ghost never changes anything.",
  },
  {
    icon: Bell,
    title: "Know what needs you",
    body: "Expired logins, failed payments and disputes surface in one place, in plain English.",
  },
  {
    icon: Sparkles,
    title: "Understand what changed",
    body: "Ghost spots drops in sales, orders and ad returns, and tells you what to check.",
  },
];

/** Two-panel layout for sign-in, sign-up and password pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-violet-700 via-violet-800 to-indigo-950 p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-sm font-bold text-violet-800">
            G
          </span>
          <span className="text-lg font-semibold tracking-tight">Ghost Core</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Everything happening in your business, in one calm place.
          </h2>
          <ul className="mt-8 space-y-6">
            {points.map(({icon: Icon, title, body}) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-0.5 text-sm text-violet-100/80">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-violet-200/70">
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
        </p>
      </aside>

      <section className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-violet-500 to-indigo-700 text-sm font-bold text-white">
              G
            </span>
            <span className="font-semibold tracking-tight">Ghost Core</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-zinc-500">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-center text-sm text-zinc-600">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
