"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {
  Activity,
  ChevronDown,
  Code,
  Cpu,
  GitBranch,
  House,
  Inbox,
  LayoutGrid,
  Plug,
  Settings,
  Sparkles,
  SquareCheckBig,
  Stamp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

type NavItem = {label: string; href: string; icon: LucideIcon; exact?: boolean};

const main: NavItem[] = [
  {label: "Home", href: "/app", icon: House, exact: true},
  {label: "Action Centre", href: "/app/action-centre", icon: Inbox},
  {label: "Insights", href: "/app/insights", icon: Sparkles},
  {label: "Connections", href: "/app/integrations", icon: Plug},
  {label: "Work", href: "/app/work", icon: SquareCheckBig},
  {label: "Automations", href: "/app/workflows", icon: Workflow},
  {label: "Settings", href: "/app/settings", icon: Settings},
];

const more: NavItem[] = [
  {label: "Timeline", href: "/app/timeline", icon: Activity},
  {label: "Approvals", href: "/app/approvals", icon: Stamp},
  {label: "Correlations", href: "/app/correlations", icon: GitBranch},
  {label: "Command Centre", href: "/app/command-centre", icon: LayoutGrid},
  {label: "Team", href: "/app/team", icon: Users},
  {label: "Background jobs", href: "/app/jobs", icon: Cpu},
  {label: "Developer tools", href: "/app/developer", icon: Code},
];

// Detail pages under these sections highlight their parent.
const aliases: Record<string, string> = {
  "/app/tasks": "/app/work",
  "/app/cases": "/app/work",
  "/app/workflow-runs": "/app/workflows",
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
      className={`group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-zinc-900 font-medium text-white shadow-sm shadow-zinc-900/20"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
    >
      <Icon
        aria-hidden
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-violet-300" : "text-zinc-400 group-hover:text-zinc-700"}`}
        strokeWidth={1.75}
      />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname() ?? "";
  const moreActive = more.some((item) => isActive(pathname, item));
  return (
    <nav aria-label="Main" className="space-y-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:flex-col md:overflow-visible md:pb-0">
        {main.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
      </div>
      <details className="group/more" open={moreActive || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-600 [&::-webkit-details-marker]:hidden">
          More
          <ChevronDown
            aria-hidden
            className="h-3.5 w-3.5 transition-transform group-open/more:rotate-180"
          />
        </summary>
        <div className="mt-1 flex flex-col gap-0.5">
          {more.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
          ))}
        </div>
      </details>
    </nav>
  );
}
