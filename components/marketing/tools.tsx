import Image from "next/image";
import {Reveal, SetType} from "./motion";

// Sizes of the processed files in /public/partners, so images keep their shape.
const LOGOS: Logo[] = [
  {slug: "shopify", name: "Shopify", w: 520, h: 148},
  {slug: "stripe", name: "Stripe", w: 381, h: 160},
  {slug: "google-analytics", name: "Google Analytics", w: 220, h: 160, big: true},
  {slug: "google-search-console", name: "Google Search Console", w: 349, h: 160},
  {slug: "meta-ads", name: "Meta Ads", w: 319, h: 160},
  {slug: "mailchimp", name: "Mailchimp", w: 160, h: 160, big: true},
  {slug: "gmail", name: "Gmail", w: 491, h: 160},
  {slug: "meta", name: "Facebook and Instagram", w: 520, h: 118},
  {slug: "outlook", name: "Outlook", w: 520, h: 107},
  {slug: "google-calendar", name: "Google Calendar", w: 520, h: 158},
  {slug: "linkedin", name: "LinkedIn", w: 520, h: 128},
  {slug: "slack", name: "Slack", w: 520, h: 133},
  {slug: "notion", name: "Notion", w: 467, h: 160},
  {slug: "github", name: "GitHub", w: 177, h: 160, big: true},
];

type Logo = {slug: string; name: string; w: number; h: number; big?: boolean};

function Row({items, reverse}: {items: Logo[]; reverse?: boolean}) {
  // Rendered twice so the loop is seamless; the copy is hidden from screen readers.
  return (
    <div className="mm-marquee group flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      {[0, 1].map((copy) => (
        <ul
          key={copy}
          aria-hidden={copy === 1}
          className={`mm-marquee-track flex shrink-0 items-center gap-6 pr-6 md:gap-8 md:pr-8 ${reverse ? "mm-marquee-reverse" : ""}`}
        >
          {items.map((logo) => (
            <li
              key={logo.slug}
              className="grid h-24 w-48 shrink-0 place-items-center rounded-2xl border border-ink/[0.07] bg-white/70 px-7 transition-all duration-500 hover:-translate-y-1 hover:border-ink/15 hover:bg-white hover:shadow-[0_18px_40px_-24px_rgba(11,24,48,0.45)] md:h-28 md:w-56"
            >
              <Image
                src={`/partners/${logo.slug}.png`}
                alt={copy === 0 ? logo.name : ""}
                width={logo.w}
                height={logo.h}
                className={`w-auto object-contain opacity-80 grayscale-[35%] transition-all duration-500 hover:opacity-100 hover:grayscale-0 ${logo.big ? "max-h-16 md:max-h-[72px]" : "max-h-11 md:max-h-12"}`}
              />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export function Tools() {
  return (
    <section id="tools" data-tone="paper" className="bg-paper py-24 text-ink md:py-36">
      <div className="mx-auto max-w-[1320px] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-mage">
                01 · The tools
              </p>
            </Reveal>
            <h2 className="mt-5 font-display text-5xl font-semibold leading-[0.95] tracking-[-0.04em] md:text-7xl">
              <SetType text="Reads the tools" className="block" />
              <SetType text="you already use." className="block" delay={0.12} />
            </h2>
          </div>
          <Reveal delay={0.15}>
            <p className="max-w-md text-lg leading-relaxed text-ink/65">
              Connect with one click and pick what matters: which shop, which ad account, which
              channels. Metric Mage only ever <em className="font-serif text-xl">reads</em>. It
              never posts, spends or deletes anything.
            </p>
          </Reveal>
        </div>
      </div>
      <div className="mt-16 space-y-6 md:mt-20">
        <Row items={LOGOS.slice(0, 7)} />
        <Row items={LOGOS.slice(7)} reverse />
      </div>
    </section>
  );
}
