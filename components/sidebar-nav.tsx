"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  Code,
  Cpu,
  Files,
  House,
  LayoutGrid,
  ListChecks,
  Mail,
  Palette,
  Plug,
  Settings,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type NavItem = {label: string; href: string; icon: LucideIcon; exact?: boolean};

const focus: NavItem[] = [
  {label: "Home", href: "/app", icon: House, exact: true},
  {label: "To do", href: "/app/todo", icon: ListChecks},
  {label: "Calendar", href: "/app/calendar", icon: CalendarDays},
  {label: "Testers", href: "/app/email-list", icon: Mail},
  {label: "Improvements", href: "/app/improvements", icon: Wrench},
  {label: "Branding", href: "/app/branding", icon: Palette},
  {label: "Documents", href: "/app/documents", icon: Files},
  {label: "Goals", href: "/app/goals", icon: Target},
];

const manage: NavItem[] = [
  {label: "Connections", href: "/app/integrations", icon: Plug},
  {label: "Team", href: "/app/team", icon: Users},
  {label: "Settings", href: "/app/settings", icon: Settings},
];

/** Technical pages, for owners and admins only. */
const advanced: NavItem[] = [
  {label: "Command Centre", href: "/app/command-centre", icon: LayoutGrid},
  {label: "Background jobs", href: "/app/jobs", icon: Cpu},
  {label: "Developer tools", href: "/app/developer", icon: Code},
];

// Detail pages under these sections highlight their parent.
const aliases: Record<string, string> = {
  "/app/tasks": "/app/work",
  "/app/cases": "/app/work",
};

function isActive(pathname: string, item: NavItem) {
  const path =
    Object.entries(aliases).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? pathname;
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

function NavLink({item, active}: {item: NavItem; active: boolean}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
        active
          ? "bg-white font-semibold text-ink shadow-lg shadow-slate-950/10"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <Icon
        aria-hidden
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-mage" : "text-white/45 group-hover:text-white/80"}`}
        strokeWidth={1.75}
      />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({
  showAdvanced = false,
  forceVertical = false,
}: {
  showAdvanced?: boolean;
  forceVertical?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const moreActive = showAdvanced && advanced.some((item) => isActive(pathname, item));
  const groups = [
    {label: "Workspace", items: focus},
    {label: "Manage", items: manage},
  ];
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {group.label}
          </p>
          <div
            className={`-mx-1 flex gap-1 px-1 pb-1 ${
              forceVertical
                ? "flex-col overflow-visible"
                : "overflow-x-auto md:flex-col md:overflow-visible md:pb-0"
            }`}
          >
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
            ))}
          </div>
        </div>
      ))}
      {showAdvanced ? (
        <details className="group/more" open={moreActive || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40 transition-colors hover:text-white/70 [&::-webkit-details-marker]:hidden">
            More
            <ChevronDown
              aria-hidden
              className="h-3.5 w-3.5 transition-transform group-open/more:rotate-180"
            />
          </summary>
          <div className="mt-1 flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[11px] text-white/35">For admins</p>
            {advanced.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
