import {describe, expect, it} from "vitest";
import {mergeSlackChannels} from "@/lib/integrations/slack/channels";
import type {SlackChannel} from "@/lib/integrations/slack/types";

const channel = (id: string, overrides: Partial<SlackChannel> = {}): SlackChannel => ({
  id,
  name: id,
  topic: "",
  purpose: "",
  created: 0,
  isArchived: false,
  isGeneral: false,
  isMember: true,
  isPrivate: false,
  isShared: false,
  isExtShared: false,
  selected: false,
  accessState: "Ready",
  historyCapability: "available",
  ...overrides,
});

describe("Slack channel refresh", () => {
  it("takes membership from Slack, not the stale saved copy", () => {
    // Saved when the app had not yet been invited; Slack now reports it as a member.
    const saved = [
      channel("C1", {
        isMember: false,
        accessState: "App must be added to channel",
        historyCapability: "membership_required",
      }),
    ];
    const [merged] = mergeSlackChannels([channel("C1")], saved);
    expect(merged).toMatchObject({
      isMember: true,
      accessState: "Ready",
      historyCapability: "available",
    });
  });

  it("keeps the user's selection and sync progress", () => {
    const saved = [
      {
        ...channel("C1"),
        selected: true,
        checkpoint: "1700000000.0001",
        cursor: "abc",
        completed: true,
      },
    ];
    const [merged] = mergeSlackChannels([channel("C1")], saved);
    expect(merged).toMatchObject({
      selected: true,
      checkpoint: "1700000000.0001",
      cursor: "abc",
      completed: true,
    });
  });

  it("adds new channels unselected and drops ones Slack no longer returns", () => {
    const merged = mergeSlackChannels(
      [channel("C1"), channel("C2")],
      [
        {...channel("C1"), selected: true},
        {...channel("GONE"), selected: true},
      ],
    );
    expect(merged.map((c) => [c.id, c.selected])).toEqual([
      ["C1", true],
      ["C2", false],
    ]);
  });

  it("tolerates missing or malformed saved data", () => {
    expect(mergeSlackChannels([channel("C1")], undefined)[0].selected).toBe(false);
    expect(mergeSlackChannels([channel("C1")], "nonsense")[0].selected).toBe(false);
  });
});
