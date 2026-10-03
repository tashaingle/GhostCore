import type {Trend} from "@/lib/home/performance";
import {CURRENT_COLOUR, linePath, PREVIOUS_COLOUR} from "./format";

const W = 120,
  H = 32,
  PAD = 4;

/** A tile's trend: this period in brand blue, the last one as a faint line behind it. */
export function Sparkline({trend, label}: {trend: Trend; label: string}) {
  const values = [...trend.current, ...trend.previous].filter((v): v is number => v !== null),
    max = Math.max(...values, 0),
    // Scaled to its own range: a sparkline shows shape, not size.
    min = Math.min(...values),
    span = max - min || 1,
    n = trend.current.length,
    x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2),
    y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2),
    lastIndex = trend.current.reduce<number>((last, v, i) => (v === null ? last : i), -1);
  if (!values.length || max === min) return null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-8 w-[120px] overflow-visible"
      role="img"
      aria-label={`${label} trend this period compared with last`}
    >
      <path
        d={linePath(trend.previous, x, y)}
        fill="none"
        stroke={PREVIOUS_COLOUR}
        strokeOpacity={0.45}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      {lastIndex >= 0 ? (
        <circle
          cx={x(lastIndex)}
          cy={y(trend.current[lastIndex]!)}
          r={3}
          fill={CURRENT_COLOUR}
          stroke="#fff"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
