"use client";
import {useEffect, useState} from "react";
import Link from "next/link";
import {AnimatePresence, motion, useReducedMotion, useScroll, useTransform} from "motion/react";
import {CountUp, ease, SetType} from "./motion";

type Note = {source: string; tone: "good" | "look" | "info"; title: string; detail: string};

// Written the way the product writes them: what happened, then what to do.
const NOTES: Note[] = [
  {
    source: "Shopify",
    tone: "good",
    title: "Orders up 18% on last week",
    detail: "Saturday was your best day since June. Most came from Instagram.",
  },
  {
    source: "Stripe",
    tone: "look",
    title: "6 card payments failed today",
    detail: "Usually it's 1 or 2. Check whether one customer is retrying the same card.",
  },
  {
    source: "Meta Ads",
    tone: "look",
    title: "Spend up 40%, purchases flat",
    detail: "The new 'Autumn' ad set is taking most of the budget. Worth pausing to compare.",
  },
  {
    source: "Search Console",
    tone: "info",
    title: "/gift-guide is climbing in Google",
    detail: "Clicks up from 12 to 61 this week. It now ranks 4th for 'small gift ideas'.",
  },
  {
    source: "GitHub",
    tone: "look",
    title: "A build failed 2 hours before traffic dipped",
    detail: "Might be related, might not. Here's the deploy and the drop side by side.",
  },
];

const TONE = {
  good: {dot: "bg-spark", label: "Going well"},
  look: {dot: "bg-amber-400", label: "Needs a look"},
  info: {dot: "bg-sky", label: "Worth knowing"},
} as const;

function Feed() {
  const reduce = useReducedMotion();
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setStart((s) => (s + 1) % NOTES.length), 4200);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-spark opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-spark" />
          </span>
          This morning
        </span>
        <span>Checked 4 min ago</span>
      </div>
      {/* Three fixed slots; each one fades to its next note in turn, top first. */}
      <ul className="space-y-3">
        {[0, 1, 2].map((slot) => {
          const note = NOTES[(start + slot) % NOTES.length];
          return (
            <li
              key={slot}
              className="relative h-[132px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm"
              style={{opacity: 1 - slot * 0.22}}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={note.title}
                  initial={{opacity: 0, y: 14}}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {duration: 0.6, ease, delay: slot * 0.12},
                  }}
                  exit={{opacity: 0, y: -10, transition: {duration: 0.3, delay: slot * 0.12}}}
                  className="absolute inset-0 p-5"
                >
                  <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.2em]">
                    <span className="text-white/55">{note.source}</span>
                    <span className="flex items-center gap-1.5 text-white/55">
                      <span className={`h-1.5 w-1.5 rounded-full ${TONE[note.tone].dot}`} />
                      {TONE[note.tone].label}
                    </span>
                  </div>
                  <p className="mt-3 truncate font-display text-lg font-medium leading-snug text-white md:text-xl">
                    {note.title}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/60">
                    {note.detail}
                  </p>
                </motion.div>
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <Sparkline />
    </div>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 400 80" className="mt-6 h-16 w-full" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3fd8c2" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3fd8c2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d="M0 62 C 40 58, 60 66, 92 52 S 150 40, 182 46 S 236 30, 268 34 S 330 12, 400 8 L 400 80 L 0 80 Z"
        fill="url(#spark-fill)"
        initial={{opacity: 0}}
        animate={{opacity: 1}}
        transition={{delay: 1.6, duration: 1}}
      />
      <motion.path
        d="M0 62 C 40 58, 60 66, 92 52 S 150 40, 182 46 S 236 30, 268 34 S 330 12, 400 8"
        fill="none"
        stroke="#3fd8c2"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{pathLength: 0}}
        animate={{pathLength: 1}}
        transition={{delay: 0.6, duration: 2.2, ease}}
      />
    </svg>
  );
}

/** Four-point star from the logo, gently twinkling. */
export function Star({className, delay = 0}: {className?: string; delay?: number}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mm-twinkle ${className ?? ""}`}
      style={{animationDelay: `${delay}s`}}
      aria-hidden
    >
      <path
        d="M12 0 C 12.8 7.2 16.8 11.2 24 12 C 16.8 12.8 12.8 16.8 12 24 C 11.2 16.8 7.2 12.8 0 12 C 7.2 11.2 11.2 7.2 12 0 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Hero() {
  const {scrollY} = useScroll();
  const drift = useTransform(scrollY, [0, 700], [0, 120]);
  const fade = useTransform(scrollY, [0, 500], [1, 0.25]);

  return (
    <section data-tone="ink" className="mm-grain relative overflow-hidden bg-ink text-white">
      {/* Faint chart grid, like graph paper behind the numbers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          maskImage: "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-10 h-[620px] w-[620px] rounded-full bg-mage/25 blur-[140px]"
      />
      <Star className="absolute left-[8%] top-[22%] h-3 w-3 text-spark/70" />
      <Star className="absolute right-[42%] top-[14%] h-2 w-2 text-sky/70" delay={1.2} />
      <Star className="absolute bottom-[18%] left-[46%] h-2.5 w-2.5 text-white/50" delay={2.1} />

      <div className="relative mx-auto grid min-h-[100svh] max-w-[1320px] items-center gap-14 px-5 pb-16 pt-32 md:px-10 lg:grid-cols-[1.25fr_1fr] lg:gap-20 lg:pt-28">
        <motion.div style={{y: drift, opacity: fade}}>
          <motion.p
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.8, ease}}
            className="font-mono text-[11px] uppercase tracking-[0.3em] text-spark"
          >
            For shops, studios and small teams
          </motion.p>
          <h1 className="mt-6 font-display text-[13vw] font-semibold leading-[0.9] tracking-[-0.045em] sm:text-[10vw] lg:text-[6.4vw] xl:text-[96px]">
            <SetType text="What changed," className="block" />
            <SetType text="and what to" className="block" delay={0.18} />
            <motion.em
              initial={{opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: 0.75, duration: 1.2, ease}}
              className="block font-serif font-normal italic tracking-[-0.02em] text-sky"
            >
              do about it.
            </motion.em>
          </h1>
          <motion.p
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.55, duration: 0.9, ease}}
            className="mt-8 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl"
          >
            Metric Mage reads Shopify, Stripe, Google, Meta and the rest of your tools every hour.
            Then it tells you, in plain English, what&apos;s going well, what needs a look, and what
            to do next.
          </motion.p>
          <motion.div
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: 0.7, duration: 0.9, ease}}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-base font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:bg-spark"
            >
              Connect your first tool
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/#how-it-works"
              className="inline-flex items-center gap-2 px-2 py-4 text-base font-medium text-white/75 underline-offset-8 transition-colors hover:text-white hover:underline"
            >
              See how it works
            </Link>
          </motion.div>

          <dl className="mt-16 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              {value: 13, suffix: "", label: "tools it reads"},
              {value: 60, suffix: " min", label: "between checks"},
              {value: 100, suffix: "%", label: "read-only"},
            ].map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  <CountUp value={s.value} suffix={s.suffix} />
                </dd>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                  {s.label}
                </p>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{opacity: 0, y: 40, rotate: 1.5}}
          animate={{opacity: 1, y: 0, rotate: 0}}
          transition={{delay: 0.4, duration: 1.1, ease}}
          className="relative rounded-[28px] border border-white/10 bg-ink-soft/60 p-6 shadow-[0_40px_120px_-30px_rgba(31,116,201,0.55)] md:p-8"
        >
          <Star className="absolute -right-3 -top-3 h-8 w-8 text-spark" delay={0.4} />
          <Feed />
        </motion.div>
      </div>

      <div className="relative mx-auto flex max-w-[1320px] justify-center pb-8 md:px-10">
        <span className="flex flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          Scroll
          <span className="mm-scroll-cue h-10 w-px bg-gradient-to-b from-white/60 to-transparent" />
        </span>
      </div>
    </section>
  );
}
