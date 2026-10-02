import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";

type Item = {id: string; name: string};

/**
 * Facebook keeps one set of permissions for Ghost Core per Facebook account, shared by every Ghost
 * organisation. Reconnecting with fewer businesses or Pages ticked silently removes them everywhere,
 * so after each connection Ghost compares with what this Facebook account showed before.
 */
export function lostItems(before: Item[], now: Item[]) {
  const current = new Set(now.map((i) => i.id)),
    seen = new Set<string>();
  return before.filter((i) => !current.has(i.id) && !seen.has(i.id) && seen.add(i.id));
}

/** What this Facebook account showed in the user's other organisations' Meta connections. */
export async function previouslyVisible(
  supabase: SupabaseClient<Database>,
  provider: "meta_ads" | "meta_social",
  metaUserId: string,
): Promise<Item[]> {
  const {data} = await supabase
    .from("integrations")
    .select("settings")
    .eq("provider", provider)
    .eq("provider_account_id", metaUserId);
  return (data ?? []).flatMap((row) => {
    const settings = (row.settings ?? {}) as Record<string, unknown>,
      list = settings[provider === "meta_ads" ? "accounts" : "assets"];
    return Array.isArray(list)
      ? list.flatMap((value) => {
          const item = value as {id?: unknown; accountId?: unknown; name?: unknown};
          const id = provider === "meta_ads" ? item.accountId : item.id;
          return typeof id === "string" ? [{id, name: String(item.name ?? id)}] : [];
        })
      : [];
  });
}

export function lostAccessMessage(lost: Item[]) {
  if (!lost.length) return "";
  const names = lost.slice(0, 5).map((i) => i.name),
    more = lost.length > 5 ? ` and ${lost.length - 5} more` : "";
  return ` Facebook no longer lets Ghost see ${names.join(", ")}${more}, in any of your organisations. If you didn't mean that, connect again and keep everything ticked on Facebook's screens.`;
}
