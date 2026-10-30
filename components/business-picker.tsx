import Link from "next/link";

/** A row of business chips at the top of a page; the chosen one is kept in the address. */
export function BusinessPicker({
  businesses,
  selectedId,
  href,
  allLabel,
}: {
  businesses: {id: string; name: string}[];
  /** null when "all businesses" is chosen. */
  selectedId: string | null;
  href: (id: string | null) => string;
  /** Offers an "all businesses" chip first when set. */
  allLabel?: string;
}) {
  if (businesses.length < 2) return null;
  const chips = [
    ...(allLabel ? [{id: null, name: allLabel}] : []),
    ...businesses.map((item) => ({id: item.id as string | null, name: item.name})),
  ];
  return (
    <nav aria-label="Business" className="flex flex-wrap gap-2">
      {chips.map((item) => {
        const active = item.id === selectedId;
        return (
          <Link
            key={item.id ?? "all"}
            href={href(item.id)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-950 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950"
            }`}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
