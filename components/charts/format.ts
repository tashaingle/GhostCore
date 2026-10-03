import type {TrendUnit} from "@/lib/home/performance";

/** Brand blue for this period; a darker grey for the last one (validated: CVD ΔE 15.7, ≥3:1). */
export const CURRENT_COLOUR = "#1d66b8";
export const PREVIOUS_COLOUR = "#8b8b95";

export function formatValue(value: number, unit: TrendUnit) {
  if (unit.kind === "money")
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: unit.currency.toUpperCase(),
      maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    }).format(value);
  return Math.round(value).toLocaleString("en-GB");
}

/** Short axis labels: £1.2K, 3.4K. */
export function formatTick(value: number, unit: TrendUnit) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
    ...(unit.kind === "money" ? {style: "currency", currency: unit.currency.toUpperCase()} : {}),
  }).format(value);
}

export function formatBucket(start: number, bucketDays: number) {
  const date = new Date(start).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return bucketDays > 1 ? `Week of ${date}` : date;
}

/** A rounded-up axis maximum (1, 2, 2.5, 5 × 10ⁿ) so ticks land on clean numbers. */
export function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value)),
    step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

/** SVG path through the non-null points, breaking the line where values are missing. */
export function linePath(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
) {
  let path = "",
    drawing = false;
  values.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    drawing = true;
  });
  return path;
}
