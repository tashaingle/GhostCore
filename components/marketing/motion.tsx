"use client";
import {useEffect, useRef, type ReactNode} from "react";
import {animate, motion, useInView, useReducedMotion, type Variants} from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const rise: Variants = {
  hidden: {opacity: 0, y: 28},
  show: {opacity: 1, y: 0, transition: {duration: 0.8, ease}},
};

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "p" | "span";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{once: true, amount: 0.25, margin: "0px 0px -60px 0px"}}
      variants={rise}
      transition={{delay}}
    >
      {children}
    </Tag>
  );
}

/** Children marked with `variants={rise}` arrive one after another. */
export function Stagger({
  children,
  className,
  gap = 0.09,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{once: true, amount: 0.2}}
      variants={{hidden: {}, show: {transition: {staggerChildren: gap, delayChildren: 0.05}}}}
    >
      {children}
    </motion.div>
  );
}

/** Splits a heading into words that rise out of a mask, like type being set. */
export function SetType({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-block overflow-hidden pb-[0.08em] align-bottom ${i < words.length - 1 ? "mr-[0.26em]" : ""}`}
        >
          <motion.span
            className="inline-block"
            initial={reduce ? false : {y: "105%"}}
            whileInView={{y: "0%"}}
            viewport={{once: true}}
            transition={{duration: 0.9, ease, delay: delay + i * 0.06}}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Counts up to a number once visible. Keeps prefix/suffix (e.g. "£", "%") fixed. */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, {once: true, amount: 0.6});
  const reduce = useReducedMotion();
  const format = (n: number) =>
    `${prefix}${n.toLocaleString("en-GB", {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}${suffix}`;

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    if (reduce) {
      node.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease,
      onUpdate: (n) => {
        node.textContent = format(n);
      },
    });
    return () => controls.stop();
    // format depends only on the props listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, prefix, suffix, decimals, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
