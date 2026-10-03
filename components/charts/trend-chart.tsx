"use client";
import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import type {Trend} from "@/lib/home/performance";
import {
  CURRENT_COLOUR,
  formatBucket,
  formatTick,
  formatValue,
  linePath,
  niceMax,
  PREVIOUS_COLOUR,
} from "./format";

export type ChartNote = {t: number; title: string};

const HEIGHT = 260,
  TOP = 20,
  BOTTOM = 28,
  LEFT = 52,
  RIGHT = 16;

/**
 * This period against the last on one axis, with a crosshair that snaps to the nearest day, one
 * tooltip for both lines, markers where Metric Mage noticed something, and a table view.
 */
export function TrendChart({
  trend,
  label,
  currentLabel,
  previousLabel,
  notes = [],
}: {
  trend: Trend;
  label: string;
  currentLabel: string;
  previousLabel: string;
  notes?: ChartNote[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const n = trend.current.length,
    values = [...trend.current, ...trend.previous].filter((v): v is number => v !== null),
    top = niceMax(Math.max(...values, 0)),
    plotW = Math.max(width - LEFT - RIGHT, 1),
    plotH = HEIGHT - TOP - BOTTOM,
    x = (i: number) => LEFT + (i / Math.max(n - 1, 1)) * plotW,
    y = (v: number) => TOP + plotH - (v / top) * plotH,
    ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top),
    bucketMs = trend.bucketDays * 86_400_000,
    noteAt = (i: number) =>
      notes.filter((note) => note.t >= trend.starts[i] && note.t < trend.starts[i] + bucketMs),
    lastIndex = trend.current.reduce<number>((last, v, i) => (v === null ? last : i), -1),
    xLabels = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    setActive(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") setActive((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? n) - 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const shown = active ?? null,
    tipLeft = shown === null ? 0 : Math.min(Math.max(x(shown) - 90, 0), Math.max(width - 180, 0));

  return (
    <figure className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03]">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-medium text-zinc-900">{label}</span>
        {/* Legend: a short line key per series, matching the marks. */}
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-0.5 w-4 rounded-full" style={{background: CURRENT_COLOUR}} />
            {currentLabel}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-0.5 w-4 rounded-full" style={{background: PREVIOUS_COLOUR}} />
            {previousLabel}
          </span>
          {notes.some((note) => note.t >= trend.starts[0]) ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-zinc-700" />
              Noticed something
            </span>
          ) : null}
        </span>
      </figcaption>

      <div ref={box} className="relative mt-4" style={{height: HEIGHT}}>
        {width > 0 ? (
          <svg width={width} height={HEIGHT} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={LEFT}
                  x2={width - RIGHT}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#e9e9ec"
                  strokeWidth={1}
                />
                <text
                  x={LEFT - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-zinc-400 text-[11px] tabular-nums"
                >
                  {formatTick(t, trend.unit)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-zinc-400 text-[11px]"
              >
                {formatBucket(trend.starts[i], trend.bucketDays)}
              </text>
            ))}

            <path
              d={linePath(trend.previous, x, y)}
              fill="none"
              stroke={PREVIOUS_COLOUR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {lastIndex > 0 ? (
              <path
                d={`${linePath(trend.current.slice(0, lastIndex + 1), x, y)}L${x(lastIndex)},${y(0)}L${x(trend.current.findIndex((v) => v !== null))},${y(0)}Z`}
                fill={CURRENT_COLOUR}
                fillOpacity={0.08}
              />
            ) : null}
            <path
              d={linePath(trend.current, x, y)}
              pathLength={1}
              className="mm-draw"
              fill="none"
              stroke={CURRENT_COLOUR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Where Metric Mage noticed something: a dot at the top and a faint line to that day. */}
            {trend.starts.map((_, i) =>
              noteAt(i).length ? (
                <g key={i}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={TOP - 4}
                    y2={TOP + plotH}
                    stroke="#d4d4d8"
                    strokeWidth={1}
                  />
                  <circle
                    cx={x(i)}
                    cy={TOP - 8}
                    r={4}
                    fill="#3f3f46"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                </g>
              ) : null,
            )}

            {/* Direct label on the latest value only. */}
            {lastIndex >= 0 && shown === null ? (
              <>
                <circle
                  cx={x(lastIndex)}
                  cy={y(trend.current[lastIndex]!)}
                  r={4}
                  fill={CURRENT_COLOUR}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={x(lastIndex)}
                  y={y(trend.current[lastIndex]!) - 12}
                  textAnchor={lastIndex > n * 0.8 ? "end" : "middle"}
                  className="fill-zinc-900 text-[12px] font-semibold"
                >
                  {formatValue(trend.current[lastIndex]!, trend.unit)}
                </text>
              </>
            ) : null}

            {shown !== null ? (
              <g pointerEvents="none">
                <line
                  x1={x(shown)}
                  x2={x(shown)}
                  y1={TOP}
                  y2={TOP + plotH}
                  stroke="#a1a1aa"
                  strokeWidth={1}
                />
                {trend.previous[shown] !== null ? (
                  <circle
                    cx={x(shown)}
                    cy={y(trend.previous[shown]!)}
                    r={4}
                    fill={PREVIOUS_COLOUR}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ) : null}
                {trend.current[shown] !== null ? (
                  <circle
                    cx={x(shown)}
                    cy={y(trend.current[shown]!)}
                    r={4}
                    fill={CURRENT_COLOUR}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ) : null}
              </g>
            ) : null}

            {/* Hit area covers the whole plot, so readers aim at a day, not a 2px line. */}
            <rect
              x={LEFT}
              y={0}
              width={plotW}
              height={TOP + plotH}
              fill="transparent"
              tabIndex={0}
              role="slider"
              aria-label={`${label}: use the arrow keys to read each ${trend.bucketDays > 1 ? "week" : "day"}`}
              aria-valuemin={0}
              aria-valuemax={n - 1}
              aria-valuenow={shown ?? lastIndex}
              aria-valuetext={
                shown === null
                  ? undefined
                  : `${formatBucket(trend.starts[shown], trend.bucketDays)}: ${trend.current[shown] === null ? "no data" : formatValue(trend.current[shown]!, trend.unit)}`
              }
              className="cursor-crosshair outline-none focus-visible:stroke-zinc-400"
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={() => setActive(null)}
              onKeyDown={keys}
              onBlur={() => setActive(null)}
            />
          </svg>
        ) : null}

        {shown !== null ? (
          <div
            className="pointer-events-none absolute top-0 w-[180px] rounded-xl border border-zinc-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur"
            style={{left: tipLeft}}
          >
            <p className="text-xs text-zinc-500">
              {formatBucket(trend.starts[shown], trend.bucketDays)}
            </p>
            {[
              [trend.current[shown], currentLabel, CURRENT_COLOUR],
              [trend.previous[shown], previousLabel, PREVIOUS_COLOUR],
            ].map(([value, name, colour]) => (
              <p key={name as string} className="mt-1.5 flex items-center gap-2">
                <span className="h-0.5 w-3 rounded-full" style={{background: colour as string}} />
                <span className="font-semibold text-zinc-950">
                  {value === null ? "—" : formatValue(value as number, trend.unit)}
                </span>
                <span className="text-zinc-500">{name as string}</span>
              </p>
            ))}
            {noteAt(shown).map((note) => (
              <p
                key={note.title}
                className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-700"
              >
                Noticed: {note.title}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">
          Show as a table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-medium">{trend.bucketDays > 1 ? "Week" : "Day"}</th>
                <th className="py-1 text-right font-medium">{currentLabel}</th>
                <th className="py-1 text-right font-medium">{previousLabel}</th>
              </tr>
            </thead>
            <tbody>
              {trend.starts.map((start, i) => (
                <tr key={start} className="border-t border-zinc-100">
                  <td className="py-1 text-zinc-600">{formatBucket(start, trend.bucketDays)}</td>
                  <td className="py-1 text-right text-zinc-900">
                    {trend.current[i] === null ? "—" : formatValue(trend.current[i]!, trend.unit)}
                  </td>
                  <td className="py-1 text-right text-zinc-600">
                    {trend.previous[i] === null ? "—" : formatValue(trend.previous[i]!, trend.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
