import type {SlackChannel} from "./types";

type SavedChannel = {
  id?: unknown;
  selected?: unknown;
  checkpoint?: unknown;
  cursor?: unknown;
  completed?: unknown;
  lastSyncAt?: unknown;
};

/**
 * Combines a fresh channel list from Slack with what was saved before. Slack is the source of
 * truth for channel details such as membership; only the user's selection and each channel's
 * sync progress are carried over. Channels no longer returned by Slack are dropped.
 */
export function mergeSlackChannels(fresh: SlackChannel[], previous: unknown): SlackChannel[] {
  const saved = new Map(
    (Array.isArray(previous) ? (previous as SavedChannel[]) : [])
      .filter((c) => typeof c?.id === "string")
      .map((c) => [c.id as string, c]),
  );
  return fresh.map((channel) => {
    const old = saved.get(channel.id);
    return {
      ...channel,
      selected: old?.selected === true,
      ...(typeof old?.checkpoint === "string" ? {checkpoint: old.checkpoint} : {}),
      ...(typeof old?.cursor === "string" ? {cursor: old.cursor} : {}),
      ...(typeof old?.completed === "boolean" ? {completed: old.completed} : {}),
      ...(typeof old?.lastSyncAt === "string" ? {lastSyncAt: old.lastSyncAt} : {}),
    };
  });
}
