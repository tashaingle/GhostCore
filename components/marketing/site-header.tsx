"use client";
import {useEffect, useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {AnimatePresence, motion} from "motion/react";
import {ease} from "./motion";

const NAV = [
  {href: "/#how-it-works", label: "How it works"},
  {href: "/#what-it-notices", label: "What it notices"},
  {href: "/#tools", label: "Tools"},
  {href: "/#trust", label: "Trust"},
];

/**
 * Fixed header that switches between light and dark to match the section underneath it
 * (sections opt in with data-tone="ink" or data-tone="paper").
 */
export function SiteHeader() {
  const [tone, setTone] = useState<"ink" | "paper">("ink");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-tone]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setTone(entry.target.getAttribute("data-tone") === "paper" ? "paper" : "ink");
      },
      // A thin band just under the header decides which section it's "over".
      {rootMargin: "-36px 0px -92% 0px"},
    );
    sections.forEach((s) => observer.observe(s));
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const dark = tone === "ink";
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled
          ? dark
            ? "bg-ink/80 backdrop-blur-md"
            : "bg-paper/85 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-5 md:h-20 md:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Metric Mage home">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
            <Image src="/brand/metric-mage-mark.png" alt="" width={30} height={30} priority />
          </span>
          <span
            className={`font-display text-lg font-semibold tracking-tight transition-colors duration-500 ${dark ? "text-white" : "text-ink"}`}
          >
            Metric Mage
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative font-mono text-[11px] uppercase tracking-[0.22em] transition-colors duration-500 ${dark ? "text-white/70 hover:text-white" : "text-ink/60 hover:text-ink"}`}
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/login"
            className={`hidden px-3 py-2 text-sm font-medium transition-colors duration-500 sm:inline-block ${dark ? "text-white/80 hover:text-white" : "text-ink/70 hover:text-ink"}`}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-500 hover:-translate-y-0.5 ${dark ? "bg-white text-ink hover:bg-spark" : "bg-ink text-white hover:bg-mage"}`}
          >
            Get started
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className={`grid h-10 w-10 place-items-center lg:hidden ${dark ? "text-white" : "text-ink"}`}
          >
            <span className="relative block h-3 w-5">
              <span
                className={`absolute left-0 top-0 h-px w-5 bg-current transition-transform duration-300 ${open ? "translate-y-1.5 rotate-45" : ""}`}
              />
              <span
                className={`absolute bottom-0 left-0 h-px w-5 bg-current transition-transform duration-300 ${open ? "-translate-y-1.5 -rotate-45" : ""}`}
              />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{opacity: 0, y: -12}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -12}}
            transition={{duration: 0.35, ease}}
            className="border-t border-white/10 bg-ink px-5 pb-8 pt-4 lg:hidden"
          >
            {[...NAV, {href: "/login", label: "Sign in"}].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block border-b border-white/10 py-4 font-display text-2xl text-white"
              >
                {item.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
