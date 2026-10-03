"use client";
import {useState} from "react";
import {AnimatePresence, motion} from "motion/react";
import {ease, Reveal, SetType} from "./motion";

const NOTICES = [
  {
    title: "Sales slowing down",
    tools: "Shopify · Stripe",
    example: {
      head: "Orders are 22% down on the same week last month",
      body: "Fewer people are reaching checkout, not fewer people visiting. The basket page is the place to look.",
    },
  },
  {
    title: "Payments failing",
    tools: "Stripe",
    example: {
      head: "4 subscription renewals failed overnight",
      body: "All four are cards that expired this month. Stripe will retry, but a quick email gets most people to update.",
    },
  },
  {
    title: "Ads that stopped paying off",
    tools: "Meta Ads · LinkedIn",
    example: {
      head: "Each sale from Meta now costs £31, up from £18",
      body: "The audience on your best ad set has been shown it 6 times on average. Fresh images usually fix this.",
    },
  },
  {
    title: "Search traffic dropping",
    tools: "Search Console · Analytics",
    example: {
      head: "Your delivery page lost half its Google clicks",
      body: "It slipped from 3rd to 9th for 'next day delivery'. It hasn't been updated since March.",
    },
  },
  {
    title: "A tool quietly stopping",
    tools: "Any connection",
    example: {
      head: "Gmail hasn't synced since Tuesday",
      body: "The login expired. Reconnecting takes about 20 seconds, and Metric Mage catches up on what it missed.",
    },
  },
  {
    title: "Changes that broke something",
    tools: "GitHub · Analytics",
    example: {
      head: "Visits fell an hour after Thursday's update",
      body: "That could be coincidence. Here's the change and the drop side by side so you can decide.",
    },
  },
];

function Example({index}: {index: number}) {
  const item = NOTICES[index];
  return (
    <motion.div
      key={index}
      initial={{opacity: 0, y: 18, rotate: -1}}
      animate={{opacity: 1, y: 0, rotate: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.45, ease}}
      className="rounded-3xl bg-ink p-8 text-white shadow-[0_40px_90px_-40px_rgba(11,24,48,0.8)]"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-spark">{item.tools}</p>
      <p className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight">
        {item.example.head}
      </p>
      <p className="mt-4 text-[17px] leading-relaxed text-white/70">{item.example.body}</p>
    </motion.div>
  );
}

export function Notices() {
  const [active, setActive] = useState(0);
  return (
    <section id="what-it-notices" data-tone="paper" className="bg-paper py-24 text-ink md:py-36">
      <div className="mx-auto max-w-[1320px] px-5 md:px-10">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-mage">
            03 · What it notices
          </p>
        </Reveal>
        <h2 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-7xl">
          <SetType text="The things you'd catch" className="block" />
          <SetType text="if you had the time." className="block" delay={0.12} />
        </h2>

        <div className="mt-16 grid gap-12 lg:mt-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <ul className="border-t border-ink/15">
            {NOTICES.map((item, i) => {
              const on = active === i;
              return (
                <li key={item.title} className="border-b border-ink/15">
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-expanded={on}
                    className="group grid w-full grid-cols-[3rem_1fr_auto] items-baseline gap-4 py-6 text-left md:py-7"
                  >
                    <span
                      className={`font-mono text-xs transition-colors duration-300 ${on ? "text-mage" : "text-ink/35"}`}
                    >
                      0{i + 1}
                    </span>
                    <span
                      className={`font-display text-2xl font-medium tracking-tight transition-all duration-500 md:text-3xl xl:text-[34px] ${on ? "translate-x-2 text-ink" : "text-ink/45 group-hover:text-ink/75"}`}
                    >
                      {item.title}
                    </span>
                    <span
                      className={`hidden font-mono text-[10px] uppercase tracking-[0.2em] transition-opacity duration-300 sm:block ${on ? "text-ink/60 opacity-100" : "opacity-0"}`}
                    >
                      {item.tools}
                    </span>
                  </button>
                  {/* On small screens the example opens under the row. */}
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div
                        initial={{height: 0, opacity: 0}}
                        animate={{height: "auto", opacity: 1}}
                        exit={{height: 0, opacity: 0}}
                        transition={{duration: 0.4, ease}}
                        className="overflow-hidden lg:hidden"
                      >
                        <div className="pb-6">
                          <Example index={i} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
          <div className="hidden lg:block">
            <div className="sticky top-32">
              <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.24em] text-ink/45">
                The kind of note you&apos;d get
              </p>
              <AnimatePresence mode="wait">
                <Example key={active} index={active} />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
