import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {createServiceClient} from "@/lib/supabase/service";

export type Person = {userId: string; name: string; email: string | null; label: string};

/**
 * Everyone active in an organisation, named the way people recognise them: their name, or their
 * email if they haven't set one. Emails come from auth with the service client, so this only ever
 * looks up users who are members of the organisation being viewed.
 */
export async function organisationPeople(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  currentUserId?: string,
) {
  const {data: members} = await supabase
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .eq("status", "active");
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return peopleIndex([]);

  const [{data: profiles}, emails] = await Promise.all([
    supabase.from("profiles").select("id,full_name").in("id", ids),
    memberEmails(ids),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || ""]));
  return peopleIndex(
    ids.map((userId) => {
      const email = emails.get(userId) ?? null,
        name = names.get(userId) || email || "Team member";
      return {
        userId,
        name,
        email,
        label: userId === currentUserId ? `${name} (you)` : name,
      };
    }),
  );
}

export function peopleIndex(people: Person[]) {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name)),
    byId = new Map(sorted.map((p) => [p.userId, p]));
  return {
    list: sorted,
    /** A display name for any user ID; former members show as "Former team member". */
    name: (userId: string | null | undefined, empty = "Unassigned") =>
      userId ? (byId.get(userId)?.label ?? "Former team member") : empty,
  };
}

async function memberEmails(userIds: string[]) {
  try {
    const admin = createServiceClient();
    const found = await Promise.all(
      userIds.map(
        async (id) => [id, (await admin.auth.admin.getUserById(id)).data.user?.email] as const,
      ),
    );
    return new Map(found.filter((e): e is readonly [string, string] => Boolean(e[1])));
  } catch {
    return new Map<string, string>();
  }
}
