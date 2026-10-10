"use client";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {motion, useInView, useScroll, useSpring} from "motion/react";
import {ease, Reveal, SetType} from "./motion";

const STEPS = [
  {
    title: "Connect",
    line: "One click per tool.",
    body: "Sign in to Shopify, Stripe, Google or Meta as you normally would, then tick the shop, ad account or website you want watched. Nothing to install, no spreadsheets.",
  },
  {
    title: "Watch",
    line: "Checked every hour.",
    body: "Metric Mage pulls in what's new, compares it with last week, last month and last year, and looks for the patterns people usually spot too late.",
  },
  {
    title: "Tell",
    line: "Written like a colleague would.",
    body: "No charts to decode. You get a short note: what happened, why it matters, and the one thing worth doing about it, with the numbers behind it if you want them.",
  },
];

function ConnectVisual() {
  const picks = ["Hutch & Co (shop)", "Autumn ads (ad account)", "hutchandco.co.uk (website)"];
  return (
    <div className="rounded-3xl bg-white p-6 text-ink shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] md:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
        Choose what to watch
      </p>
      <ul className="mt-5 space-y-3">
        {picks.map((pick, i) => (
          <motion.li
            key={pick}
            initial={{opacity: 0, x: -16}}
            whileInView={{opacity: 1, x: 0}}
            viewport={{once: true, amount: 0.6}}
            transition={{delay: 0.2 + i * 0.25, duration: 0.6, ease}}
            className="flex items-center gap-3 rounded-xl border border-ink/10 px-4 py-3"
          >
            <motion.span
              initial={{scale: 0}}
              whileInView={{scale: 1}}
              viewport={{once: true}}
              transition={{delay: 0.6 + i * 0.25, type: "spring", stiffness: 420, damping: 18}}
              className="grid h-5 w-5 place-items-center rounded-md bg-mage text-[11px] text-white"
            >
              ✓
            </motion.span>
            <span className="text-[15px]">{pick}</span>
          </motion.li>
        ))}
      </ul>
      <motion.p
        initial={{opacity: 0}}
        whileInView={{opacity: 1}}
        viewport={{once: true}}
        transition={{delay: 1.5}}
        className="mt-5 text-sm text-ink/55"
      >
        First sync starting…
      </motion.p>
    </div>
  );
}

function WatchVisual() {
  // A day of hourly checks; taller bars are busier hours.
  const bars = [3, 2, 2, 1, 1, 2, 4, 6, 8, 7, 9, 10, 8, 7, 9, 11, 12, 10, 9, 13, 15, 12, 8, 5];
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
        <span>Today, hour by hour</span>
        <span className="text-spark">24 checks</span>
      </div>
      <div className="mt-8 flex h-40 items-end gap-[5px]">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            initial={{scaleY: 0}}
            whileInView={{scaleY: 1}}
            viewport={{once: true, amount: 0.5}}
            transition={{delay: i * 0.035, duration: 0.6, ease}}
            style={{height: `${(h / 15) * 100}%`, transformOrigin: "bottom"}}
            className={`flex-1 rounded-t-[3px] ${i === 20 ? "bg-spark" : "bg-sky/45"}`}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between font-mono text-[10px] text-white/35">
        <span>00:00</span>
        <span>12:00</span>
        <span>Now</span>
      </div>
      <p className="mt-6 text-sm text-white/60">
        <span className="text-spark">8pm:</span> busiest hour this month. Worth knowing if you
        schedule posts or emails.
      </p>
    </div>
  );
}

function TellVisual() {
  const lines = [
    ["What happened", "Refunds doubled this week: 14, up from 7."],
    ["Why it matters", "Most were the same product, the large hutch."],
    ["What to do", "Check the latest batch before the weekend rush."],
  ];
  return (
    <div className="rounded-3xl bg-paper p-6 text-ink md:p-8">
      <p className="font-display text-2xl font-semibold leading-tight tracking-tight">
        Refunds on the large hutch are climbing
      </p>
      <dl className="mt-6 space-y-4">
        {lines.map(([label, text], i) => (
          <motion.div
            key={label}
            initial={{opacity: 0, y: 12}}
            whileInView={{opacity: 1, y: 0}}
            viewport={{once: true, amount: 0.6}}
            transition={{delay: 0.25 + i * 0.35, duration: 0.6, ease}}
            className="border-t border-ink/10 pt-4"
          >
            <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-mage">{label}</dt>
            <dd className="mt-1.5 text-[15px] leading-relaxed text-ink/80">{text}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}

const VISUALS: ReactNode[] = [
  <ConnectVisual key="c" />,
  <WatchVisual key="w" />,
  <TellVisual key="t" />,
];

function Step({index, onActive}: {index: number; onActive: (i: number) => void}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, {amount: 0.55});
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  const step = STEPS[index];
  return (
    <div ref={ref} className="flex flex-col justify-center py-10 lg:min-h-[70vh] lg:py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-spark lg:hidden">
        0{index + 1} · {step.title}
      </p>
      <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
        {step.line}
      </h3>
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/65">{step.body}</p>
      <div className="mt-10 max-w-lg">{VISUALS[index]}</div>
    </div>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const {scrollYProgress} = useScroll({target: ref, offset: ["start center", "end center"]});
  const progress = useSpring(scrollYProgress, {stiffness: 120, damping: 30});

  return (
    <section
      id="how-it-works"
      ref={ref}
      data-tone="ink"
      className="mm-grain relative bg-ink text-white"
    >
      <div className="mx-auto max-w-[1320px] px-5 pt-16 md:px-10 md:pt-36">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-spark">
            02 · How it works
          </p>
        </Reveal>
        <h2 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-7xl">
          <SetType text="Three steps." className="block" />
          <span className="block font-serif font-normal italic text-sky">
            <SetType text="Then it just works." delay={0.15} />
          </span>
        </h2>
      </div>

      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 pb-16 md:px-10 md:pb-32 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="hidden lg:block">
          <div className="sticky top-32 pt-12">
            <div className="flex gap-8">
              <div className="relative w-px bg-white/10">
                <motion.div
                  style={{scaleY: progress, transformOrigin: "top"}}
                  className="absolute inset-0 bg-spark"
                />
              </div>
              <ol className="space-y-10">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex items-baseline gap-6">
                    <span
                      className={`font-mono text-sm transition-colors duration-500 ${active === i ? "text-spark" : "text-white/25"}`}
                    >
                      0{i + 1}
                    </span>
                    <span
                      className={`font-display text-6xl font-semibold tracking-[-0.04em] transition-all duration-500 xl:text-7xl ${active === i ? "text-white" : "text-white/15"}`}
                    >
                      {step.title}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div>
          {STEPS.map((step, i) => (
            <Step key={step.title} index={i} onActive={setActive} />
          ))}
        </div>
      </div>
    </section>
  );
}
