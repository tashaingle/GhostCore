import {switchOrganisation} from "@/app/organisation-actions";
import {projectHref, sortProjects} from "@/lib/home/projects";
import type {Period} from "@/lib/home/performance";

export type ProjectTone = "good" | "bad" | "steady" | "quiet" | "empty";

const TONE_COLOUR: Record<ProjectTone, string> = {
  good: "#00c875",
  bad: "#e2445c",
  steady: "#fdab3d",
  quiet: "#579bfc",
  empty: "#c4c4c4",
};

export function ProjectRail({
  projects,
  activeId,
  scope,
  period,
}: {
  projects: {id: string; name: string; tone?: ProjectTone}[];
  activeId: string;
  scope: "all" | "one";
  period: Period;
}) {
  const sorted = sortProjects(projects);
  const row = (current: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
      current
        ? "bg-violet-50 font-semibold text-violet-800"
        : "text-zinc-700 hover:bg-zinc-100"
    }`;
  return (
    <nav
      aria-label="Projects"
      className="h-fit rounded-lg bg-white p-3 shadow-sm ring-1 ring-zinc-200/80 lg:sticky lg:top-4"
    >
      <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Boards
      </p>
      <ul className="flex flex-col gap-0.5">
        <li>
          <a href={projectHref("all", period)} aria-current={scope === "all" ? "page" : undefined} className={row(scope === "all")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-violet-600" aria-hidden />
            All projects
          </a>
        </li>
        {sorted.map((project) => {
          const current = scope === "one" && project.id === activeId;
          const colour = TONE_COLOUR[project.tone ?? "empty"];
          const body = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{background: colour}} aria-hidden />
              <span className="truncate">{project.name}</span>
            </>
          );
          return (
            <li key={project.id}>
              {current ? (
                <p className={row(true)}>{body}</p>
              ) : (
                <form action={switchOrganisation}>
                  <input type="hidden" name="organisationId" value={project.id} />
                  <input type="hidden" name="next" value={projectHref("one", period)} />
                  <button className={row(false)}>{body}</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
