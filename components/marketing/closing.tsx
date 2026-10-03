import Image from "next/image";
import Link from "next/link";
import {Star} from "./hero";
import {Reveal, SetType} from "./motion";

// Each claim is true of the product today; keep it that way.
const PROMISES = [
  {
    big: "Read-only",
    body: "Metric Mage asks every tool for permission to read, never to post, spend, refund or delete. It can't change anything even if it wanted to.",
  },
  {
    big: "Encrypted",
    body: "Logins to your tools are locked with AES-256 encryption before they're stored, and they're never shown on screen.",
  },
  {
    big: "Shows its working",
    body: "Every note links to the numbers behind it. If Metric Mage says sales dropped, you can see exactly which sales and when.",
  },
  {
    big: "Yours to delete",
    body: "Disconnect a tool and its access is gone. Delete your organisation and everything goes with it, straight away.",
  },
];

export function Trust() {
  return (
    <section
      id="trust"
      data-tone="ink"
      className="mm-grain relative bg-ink py-24 text-white md:py-36"
    >
      <div className="mx-auto max-w-[1320px] px-5 md:px-10">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-spark">05 · Trust</p>
        </Reveal>
        <h2 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-7xl">
          <SetType text="Your data stays" className="block" />
          <span className="block font-serif font-normal italic text-sky">
            <SetType text="yours." delay={0.12} />
          </span>
        </h2>
        <ul className="mt-16 grid gap-px overflow-hidden rounded-3xl bg-white/10 md:mt-24 md:grid-cols-2">
          {PROMISES.map((p, i) => (
            <Reveal as="li" key={p.big} delay={i * 0.08} className="group bg-ink p-8 md:p-12">
              <p className="font-mono text-[11px] text-white/35">0{i + 1}</p>
              <p className="mt-6 font-display text-4xl font-semibold tracking-[-0.03em] transition-colors duration-500 group-hover:text-spark md:text-5xl">
                {p.big}
              </p>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/60">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCall() {
  return (
    <section
      data-tone="paper"
      className="relative overflow-hidden bg-paper py-28 text-ink md:py-44"
    >
      <Star className="absolute left-[12%] top-[20%] h-6 w-6 text-mage" />
      <Star className="absolute right-[14%] top-[30%] h-4 w-4 text-spark" delay={1.4} />
      <Star className="absolute bottom-[22%] right-[30%] h-3 w-3 text-sky" delay={0.7} />
      <div className="relative mx-auto max-w-[1320px] px-5 text-center md:px-10">
        <h2 className="mx-auto max-w-5xl font-display text-[15vw] font-semibold leading-[0.88] tracking-[-0.05em] md:text-[9vw] xl:text-[132px]">
          <SetType text="Let the mage" className="block" />
          <span className="block">
            <SetType text="do the" delay={0.12} />{" "}
            <span className="font-serif font-normal italic text-mage">
              <SetType text="maths." delay={0.22} />
            </span>
          </span>
        </h2>
        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-ink/65">
            Connect your first tool in about a minute. You&apos;ll have your first plain-English
            update as soon as it&apos;s synced.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="group inline-flex items-center gap-3 rounded-full bg-ink px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-mage"
            >
              Get started
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/login"
              className="px-4 py-4 text-base font-medium text-ink/70 underline-offset-8 hover:text-ink hover:underline"
            >
              I already have an account
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer data-tone="ink" className="bg-ink text-white">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:px-10 md:py-20">
        <div>
          <Image
            src="/brand/metric-mage-logo.png"
            alt="Metric Mage"
            width={720}
            height={454}
            className="h-auto w-44 rounded-2xl bg-white p-3"
          />
          <p className="mt-6 max-w-xs text-white/55">
            Plain-English updates on how your business is doing, from the tools you already use.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">Product</p>
          <ul className="mt-4 space-y-3 text-white/75">
            <li>
              <Link className="hover:text-white" href="/#how-it-works">
                How it works
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/#tools">
                Tools
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/login">
                Sign in
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/register">
                Get started
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
            The small print
          </p>
          <ul className="mt-4 space-y-3 text-white/75">
            <li>
              <Link className="hover:text-white" href="/privacy">
                Privacy
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/terms">
                Terms
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/data-deletion">
                Deleting your data
              </Link>
            </li>
            <li>
              <a className="hover:text-white" href="mailto:support@metricmage.co.uk">
                support@metricmage.co.uk
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1320px] flex-wrap justify-between gap-4 px-5 py-6 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 md:px-10">
          <span>© {new Date().getFullYear()} Metric Mage</span>
          <span>Made in the UK</span>
        </div>
      </div>
    </footer>
  );
}
