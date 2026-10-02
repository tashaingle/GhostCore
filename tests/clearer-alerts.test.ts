import {describe, expect, it} from "vitest";
import {commandAlerts} from "@/lib/command-centre/alerts";
import type {CommandIntegration} from "@/lib/command-centre/types";
import {humanizeNotificationDisplay, humanCategory} from "@/lib/ui/labels";
import {getProvider} from "@/lib/integrations/registry";
import {connectionStatus} from "@/lib/home/connections";
import {providers} from "@/lib/integrations/registry";

const NOW = new Date("2026-10-02T12:00:00Z");
const integration = (overrides: Partial<CommandIntegration> = {}): CommandIntegration => ({
  id: "i1",
  provider: "gmail",
  provider_account_name: "me@example.test",
  status: "connected",
  last_sync_at: "2026-10-02T11:00:00Z",
  last_sync_status: "success",
  last_sync_error: null,
  token_expires_at: null,
  settings: {},
  ...overrides,
});

describe("one alert per connection", () => {
  it("reports an expired login once, not as expired and stale and failing", () => {
    const alerts = commandAlerts(
      [
        integration({
          status: "expired",
          last_sync_at: "2026-08-02T19:00:00Z",
          last_sync_status: "error",
          last_sync_error: "Provider authorization expired.",
        }),
      ],
      [],
      [],
      [],
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      title: "Gmail: login expired",
      severity: "critical",
      href: "/api/integrations/gmail/connect",
    });
  });

  it("uses the same words as the home page", () => {
    const row = integration({provider: "github", last_sync_at: "2026-08-02T19:00:00Z"}),
      [alert] = commandAlerts([row], [], [], [], NOW);
    expect(alert.detail).toBe(connectionStatus(row, getProvider("github"), NOW).detail);
    expect(alert.detail).toBe("No new data coming in. Last synced on 2 Aug.");
  });

  it("ignores Ghost's own audit events", () => {
    const audit = {
      id: "e1",
      source: "ghost",
      event_type: "notification.reopened",
      title: "Notification reopened: background_job_retrying",
      description: null,
      severity: "critical",
      occurred_at: "2026-10-02T11:00:00Z",
      metadata: {},
    };
    expect(commandAlerts([], [audit], [], [], NOW)).toEqual([]);
    expect(commandAlerts([], [{...audit, source: "stripe"}], [], [], NOW)).toHaveLength(1);
  });

  it("stays quiet for healthy and disconnected connections", () => {
    expect(
      commandAlerts(
        [integration(), integration({id: "i2", status: "disconnected"})],
        [],
        [],
        [],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("plain-English alert text", () => {
  const display = (title: string, sourceType = "integration") =>
    humanizeNotificationDisplay({
      title,
      summary: "",
      recommendedAction: "",
      ruleKey: "integration_error",
      sourceType,
      sourceId: "i1",
      integrationById: new Map([["i1", {provider: "gmail", name: null}]]),
    }).title;

  it("keeps current titles as written", () => {
    expect(display("Gmail is disconnected")).toBe("Gmail is disconnected");
    expect(display("Gmail login expired")).toBe("Gmail login expired");
  });

  it("still tidies legacy titles that used raw provider ids", () => {
    expect(display("gmail is expired")).toBe("Gmail needs attention");
  });

  it("calls background-task alerts System, not Automation", () =>
    expect(humanCategory("background_job")).toBe("System"));

  it("describes every tool in plain English", () => {
    for (const p of providers) {
      expect(p.description, p.id).toBeTruthy();
      expect(p.description, p.id).not.toMatch(/deterministic|organisation timeline|provider/i);
    }
  });
});
