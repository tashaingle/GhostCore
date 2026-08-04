import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (user) redirect("/app/command-centre");

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-violet-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
            G
          </span>
          <span className="font-semibold tracking-tight">Ghost Core</span>
        </div>
        <div className="flex items-center gap-3">
          <Link className="text-sm text-zinc-600 hover:text-zinc-900" href="/privacy">
            Privacy
          </Link>
          <Link className="text-sm text-zinc-600 hover:text-zinc-900" href="/terms">
            Terms
          </Link>
          <Link className="button button-secondary" href="/login">
            Sign in
          </Link>
          <Link className="button" href="/register">
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-10 md:pt-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">
          Operations intelligence
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-zinc-950 md:text-5xl">
          See what changed across your stack - and what to do next.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-zinc-600">
          Ghost connects Stripe, Shopify, GitHub, Google, Slack and more into one
          secure timeline. It surfaces deterministic insights with evidence, so
          your team can act without drowning in dashboards.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="button" href="/register">
            Create free account
          </Link>
          <Link className="button button-secondary" href="/login">
            Sign in to workspace
          </Link>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "One timeline",
              body: "Payments, deploys, ads, email and store activity in one place - organised by your company.",
            },
            {
              title: "Clear insights",
              body: "Failed workflows, traffic drops after deploys, and other risks with confidence and evidence.",
            },
            {
              title: "Built for teams",
              body: "Multi-workspace, roles, approvals and action tracking - without giving tools write access.",
            },
          ].map((item) => (
            <article className="card" key={item.title}>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-zinc-500">
          <span>Ghost Core</span>
          <div className="flex gap-4">
            <Link className="hover:text-zinc-800" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="hover:text-zinc-800" href="/terms">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
