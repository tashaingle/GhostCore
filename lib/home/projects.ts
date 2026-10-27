import type {Period} from "@/lib/home/performance";

const PROJECT_ORDER = ["xufu", "carprise", "prestige", "tzkia", "tazkia"];

function projectRank(name: string) {
  const key = name.toLowerCase();
  const index = PROJECT_ORDER.findIndex((item) => key.includes(item));
  return index === -1 ? PROJECT_ORDER.length : index;
}

export function sortProjects<T extends {name: string}>(projects: T[]) {
  return [...projects].sort(
    (a, b) => projectRank(a.name) - projectRank(b.name) || a.name.localeCompare(b.name, "en-GB"),
  );
}

export function projectHref(scope: "all" | "one", period: Period, list?: "mine" | "team") {
  const query = new URLSearchParams();
  if (scope === "one") query.set("scope", "one");
  if (period !== "week") query.set("period", period);
  if (scope === "one" && list === "team") query.set("list", "team");
  if (scope === "all" && list === "mine") query.set("list", "mine");
  const text = query.toString();
  return text ? `/app?${text}` : "/app";
}
