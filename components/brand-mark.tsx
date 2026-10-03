import Image from "next/image";

export const BRAND_NAME = "Metric Mage";

/** The Metric Mage mage-and-star mark, on a white tile so it shows on any background. */
export function BrandMark({size = 32}: {size?: number}) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white ring-1 ring-zinc-200/70"
      style={{width: size, height: size}}
    >
      <Image src="/brand/metric-mage-mark.png" alt="" width={size - 4} height={size - 4} priority />
    </span>
  );
}
