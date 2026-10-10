"use client";
import {useState} from "react";
import Link from "next/link";
import {AnimatePresence, motion} from "motion/react";
import {monthlyMinor, PLAN, pounds} from "@/lib/billing/plan";
import {ease, Reveal, SetType} from "./motion";

// Every line here must stay true of the product.
const INCLUDED = [
  "Every tool Metric Mage connects to",
  "Unlimited team members, free",
  "Plain-English updates and alerts",
  "Week, month and year comparisons",
  "Email alerts for anything urgent",
  "Cancel any time from your account",
];

/** One plan, with a little calculator for people who run more than three businesses. */
export function Pricing() {
  const [count, setCount] = useState(1);
  const total = monthlyMinor(count),
    extra = Math.max(0, count - PLAN.includedOrganisations);

  return (
    <section id="pricing" data-tone="paper" className="bg-paper py-16 text-ink md:py-36">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 md:px-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-20">
        <div>
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-mage">
              05 · Pricing
            </p>
          </Reveal>
          <h2 className="mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-7xl">
            <SetType text="One simple price." className="block" />
            <span className="block font-serif font-normal italic text-mage">
              <SetType text="Everything included." delay={0.12} />
            </span>
          </h2>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/65">
              {`${pounds(PLAN.baseMinor)} a month covers up to ${PLAN.includedOrganisations} businesses. Run more? Each extra one is ${pounds(PLAN.extraOrganisationMinor)} a month. Try it free for ${PLAN.trialDays} days.`}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="relative overflow-hidden rounded-[28px] bg-ink p-7 text-white shadow-[0_40px_100px_-50px_rgba(11,24,48,0.8)] md:p-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-spark">
                  Metric Mage
                </p>
                <p className="mt-3 flex items-baseline gap-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={total}
                      initial={{opacity: 0, y: 12}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -12}}
                      transition={{duration: 0.3, ease}}
                      className="font-display text-6xl font-semibold tracking-[-0.04em] md:text-7xl"
                    >
                      {pounds(total)}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-white/60">a month</span>
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {extra
                    ? `${pounds(PLAN.baseMinor)} for ${PLAN.includedOrganisations} + ${pounds(extra * PLAN.extraOrganisationMinor)} for ${extra} more`
                    : `Includes up to ${PLAN.includedOrganisations} organisations`}
                </p>
              </div>

              <div>
                <p className="text-sm text-white/60" id="org-count-label">
                  How many businesses?
                </p>
                <div
                  className="mt-2 flex items-center rounded-full border border-white/15 p-1"
                  role="group"
                  aria-labelledby="org-count-label"
                >
                  <button
                    type="button"
                    onClick={() => setCount((c) => Math.max(1, c - 1))}
                    disabled={count === 1}
                    aria-label="Fewer"
                    className="grid h-10 w-10 place-items-center rounded-full text-lg transition-colors hover:bg-white/10 disabled:opacity-30"
                  >
                    −
                  </button>
                  <output aria-live="polite" className="w-10 text-center text-lg font-semibold">
                    {count}
                  </output>
                  <button
                    type="button"
                    onClick={() => setCount((c) => Math.min(20, c + 1))}
                    aria-label="More"
                    className="grid h-10 w-10 place-items-center rounded-full text-lg transition-colors hover:bg-white/10"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <ul className="mt-8 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] text-white/80">
                  <span aria-hidden className="mt-0.5 text-spark">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="group mt-9 flex w-full items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-base font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:bg-spark"
            >
              {`Start your ${PLAN.trialDays}-day free trial`}
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <p className="mt-3 text-center text-xs text-white/50">
              Add a card to start. Cancel before the trial ends and you won&apos;t pay anything.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
