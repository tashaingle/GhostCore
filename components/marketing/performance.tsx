"use client";
import {useEffect, useRef, useState} from "react";
import {animate, AnimatePresence, motion, useReducedMotion} from "motion/react";
import {ease, Reveal, SetType} from "./motion";

type Period = "Week" | "Month" | "Year";

const DATA: Record<
  Period,
  {
    metrics: {label: string; value: number; prefix?: string; change: number}[];
    good: string[];
    look: string[];
  }
> = {
  Week: {
    metrics: [
      {label: "Revenue", value: 4250, prefix: "£", change: 12},
      {label: "Orders", value: 52, change: 3},
      {label: "Ad spend", value: 380, prefix: "£", change: -8},
      {label: "Visits", value: 3120, change: 24},
    ],
    good: [
      "Revenue up 12% to £4,250",
      "Visits up 24%, mostly from Google",
      "All 9 tools up to date",
    ],
    look: ["Refunds doubled: 14, up from 7"],
  },
  Month: {
    metrics: [
      {label: "Revenue", value: 17840, prefix: "£", change: 6},
      {label: "Orders", value: 214, change: -4},
      {label: "Ad spend", value: 1610, prefix: "£", change: 15},
      {label: "Visits", value: 12900, change: 9},
    ],
    good: ["Revenue up 6% to £17,840", "Instagram followers up 310"],
    look: ["Ad spend up 15% while orders fell 4%", "2 card payments still unpaid"],
  },
  Year: {
    metrics: [
      {label: "Revenue", value: 196400, prefix: "£", change: 31},
      {label: "Orders", value: 2470, change: 27},
      {label: "Ad spend", value: 17900, prefix: "£", change: 11},
      {label: "Visits", value: 151000, change: 44},
    ],
    good: [
      "Revenue up 31% on last year",
      "Google now brings 2× the visits",
      "Best December so far",
    ],
    look: ["Cost per sale on Meta up 18% since spring"],
  },
};

function Figure({value, prefix = ""}: {value: number; prefix?: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const show = (n: number) =>
      (node.textContent = `${prefix}${Math.round(n).toLocaleString("en-GB")}`);
    if (reduce) {
      show(value);
      return;
    }
    const controls = animate(previous.current, value, {duration: 0.9, ease, onUpdate: show});
    previous.current = value;
    return () => controls.stop();
  }, [value, prefix, reduce]);
  return <span ref={ref}>{prefix}0</span>;
}

export function Performance() {
  const [period, setPeriod] = useState<Period>("Week");
  const data = DATA[period];
  const previous =
    period === "Week" ? "last week" : period === "Month" ? "last month" : "last year";

  return (
    <section data-tone="paper" className="bg-paper-deep py-24 text-ink md:py-36">
      <div className="mx-auto max-w-[1320px] px-5 md:px-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-mage">
                04 · How you&apos;re doing
              </p>
            </Reveal>
            <h2 className="mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-6xl">
              <SetType text="Your week," className="block" />
              <SetType text="month and year," className="block" delay={0.1} />
              <span className="block font-serif font-normal italic text-mage">
                <SetType text="at a glance." delay={0.2} />
              </span>
            </h2>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/65">
                Money, marketing and the day-to-day in one place, compared with the period before.
                Try it: the numbers below are an example shop.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <div className="rounded-[28px] bg-white p-6 shadow-[0_40px_100px_-50px_rgba(11,24,48,0.5)] md:p-10">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-display text-xl font-semibold tracking-tight">
                  How you&apos;re doing
                </p>
                <div className="relative flex rounded-full bg-paper p-1" role="tablist">
                  {(Object.keys(DATA) as Period[]).map((p) => (
                    <button
                      key={p}
                      role="tab"
                      aria-selected={period === p}
                      onClick={() => setPeriod(p)}
                      className={`relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300 ${period === p ? "text-white" : "text-ink/60 hover:text-ink"}`}
                    >
                      {period === p && (
                        <motion.span
                          layoutId="period-pill"
                          className="absolute inset-0 -z-10 rounded-full bg-ink"
                          transition={{type: "spring", stiffness: 380, damping: 32}}
                        />
                      )}
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-ink/10 md:grid-cols-4">
                {data.metrics.map((m) => (
                  <div key={m.label} className="bg-white p-5">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/45">
                      {m.label}
                    </dt>
                    <dd className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                      <Figure value={m.value} prefix={m.prefix} />
                    </dd>
                    <p
                      className={`mt-1 text-sm font-medium ${
                        (m.label === "Ad spend" ? -m.change : m.change) >= 0
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }`}
                    >
                      {m.change > 0 ? "▲" : "▼"} {Math.abs(m.change)}%
                    </p>
                  </div>
                ))}
              </dl>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  {title: "Going well", items: data.good, dot: "bg-emerald-500"},
                  {title: "Needs a look", items: data.look, dot: "bg-amber-500"},
                ].map((box) => (
                  <div key={box.title} className="rounded-2xl border border-ink/10 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-2 w-2 rounded-full ${box.dot}`} />
                      {box.title}
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.ul
                        key={period}
                        initial={{opacity: 0, y: 8}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -8}}
                        transition={{duration: 0.35, ease}}
                        className="mt-3 space-y-2 text-[15px] text-ink/75"
                      >
                        {box.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </motion.ul>
                    </AnimatePresence>
                  </div>
                ))}
              </div>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
                Compared with {previous}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
