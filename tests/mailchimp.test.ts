import {describe, expect, it} from "vitest";
import {providerRegistry} from "@/lib/integrations/registry";
import {MailchimpClient} from "@/lib/integrations/mailchimp/client";
import {MailchimpConnector} from "@/lib/integrations/mailchimp/connector";
import {translateMailchimp} from "@/lib/integrations/mailchimp/translator";
import type {MailchimpCampaign} from "@/lib/integrations/mailchimp/types";
import {performanceMetrics} from "@/lib/home/performance";

const context = {organisationId: "o", integrationId: "i", receivedAt: "2026-10-03T12:00:00Z"};
const campaign = (over: Partial<MailchimpCampaign> = {}): MailchimpCampaign => ({
  id: "c1",
  send_time: "2026-09-28T09:00:00+00:00",
  emails_sent: 1200,
  settings: {subject_line: "Autumn hutches are here", title: "Autumn launch"},
  recipients: {list_id: "L1", list_name: "Customers"},
  report_summary: {unique_opens: 510, open_rate: 0.425, clicks: 90, click_rate: 0.0612},
  ...over,
});

describe("Mailchimp", () => {
  it("syncs daily and isn't labelled read-only, because Mailchimp can't grant that", () => {
    expect(providerRegistry.mailchimp.schedule).toBe("daily");
    expect(providerRegistry.mailchimp.capabilities).not.toContain("read_only");
  });

  it("records audiences as daily snapshots", () => {
    const event = translateMailchimp(
      {
        kind: "audience",
        day: "2026-10-03",
        audience: {id: "L1", name: "Customers", stats: {member_count: 2480, open_rate: 41.2}},
      },
      context,
    );
    expect(event).toMatchObject({
      eventType: "mailchimp.audience.daily_recorded",
      title: "Customers: 2,480 subscribers",
      occurredAt: "2026-10-03T23:59:59.000Z",
      externalId: "mailchimp:i:audience:L1:2026-10-03",
      metadata: {subscribers: 2480, openRate: 41.2},
    });
  });

  it("records a campaign when sent, and its settled results as percentages", () => {
    const sent = translateMailchimp({kind: "sent", campaign: campaign()}, context);
    expect(sent?.title).toBe("Email campaign sent: Autumn hutches are here");
    expect(sent?.description).toBe("Sent to 1,200 people in Customers.");
    const results = translateMailchimp({kind: "results", campaign: campaign()}, context);
    expect(results?.eventType).toBe("mailchimp.campaign.results_recorded");
    expect(results?.description).toBe("42.5% opened and 6.1% clicked, out of 1,200 sent.");
    expect(results?.occurredAt).toBe("2026-10-01T09:00:00.000Z");
    expect(results?.externalId).not.toBe(sent?.externalId);
  });

  it("only includes ticked audiences, remembers where it got to, and lists new audiences", async () => {
    const calls: string[] = [];
    const request = (async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/lists"))
        return new Response(
          JSON.stringify({
            lists: [
              {id: "L1", name: "Customers", stats: {member_count: 100}},
              {id: "L2", name: "Staff", stats: {member_count: 5}},
              {id: "L3", name: "New list", stats: {member_count: 1}},
            ],
          }),
        );
      return new Response(
        JSON.stringify({
          campaigns: [
            campaign(),
            campaign({id: "c2", recipients: {list_id: "L2"}, send_time: "2026-09-30T09:00:00Z"}),
          ],
        }),
      );
    }) as typeof fetch;
    const connector = new MailchimpConnector(
      new MailchimpClient("token", "https://us21.api.mailchimp.com", request),
      {
        apiEndpoint: "https://us21.api.mailchimp.com",
        audiences: [
          {id: "L1", name: "Customers", selected: true},
          {id: "L2", name: "Staff", selected: false},
        ],
      },
    );
    const result = await connector.sync(
      {organisationId: "o", integrationId: "i"},
      new Date("2026-10-03T12:00:00Z"),
    );
    expect(calls[0]).toMatch(/^https:\/\/us21\.api\.mailchimp\.com\/3\.0\/lists\?/);
    const audienceIds = result.events
      .filter((e) => e.eventType === "mailchimp.audience.daily_recorded")
      .map((e) => e.metadata?.audienceId);
    expect(audienceIds).toEqual(["L1", "L3"]);
    expect(result.events.some((e) => e.metadata?.audienceId === "L2")).toBe(false);
    expect(result.settings).toMatchObject({
      campaignCursor: "2026-09-30T09:00:00Z",
      audiences: [
        {id: "L1", selected: true},
        {id: "L2", selected: false},
        {id: "L3", selected: true},
      ],
    });
  });

  it("explains failures in plain English", async () => {
    const failing = (status: number) =>
      (async () => new Response(JSON.stringify({detail: "nope"}), {status})) as typeof fetch;
    const client = (status: number) =>
      new MailchimpClient("t", "https://us1.api.mailchimp.com", failing(status));
    await expect(client(401).audiences()).rejects.toMatchObject({kind: "unauthorized"});
    await expect(client(429).audiences()).rejects.toMatchObject({kind: "rate_limit"});
    await expect(client(500).audiences()).rejects.toThrow(
      "Mailchimp couldn't be read (500: nope).",
    );
  });

  it("adds email subscribers and campaign open rate to How you're doing", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const snapshot = (day: string, audienceId: string, subscribers: number) => ({
      id: `${audienceId}-${day}`,
      source: "mailchimp",
      eventType: "mailchimp.audience.daily_recorded",
      occurredAt: `${day}T23:59:59.000Z`,
      metadata: {audienceId, subscribers},
    });
    const results = (day: string, openRate: number) => ({
      id: `r-${day}`,
      source: "mailchimp",
      eventType: "mailchimp.campaign.results_recorded",
      occurredAt: `${day}T09:00:00.000Z`,
      metadata: {openRate},
    });
    const metrics = performanceMetrics({
      events: [
        snapshot("2026-09-25", "L1", 900),
        snapshot("2026-09-25", "L2", 100),
        snapshot("2026-10-01", "L1", 1000),
        snapshot("2026-10-02", "L1", 1100),
        snapshot("2026-10-02", "L2", 100),
        results("2026-09-24", 40),
        results("2026-10-01", 44),
      ] as never,
      counts: {} as never,
      period: "week",
      now,
    });
    const subscribers = metrics.find((m) => m.key === "emailSubscribers");
    expect(subscribers).toMatchObject({value: "1,200", change: 20, comparable: true});
    const openRate = metrics.find((m) => m.key === "campaignOpenRate");
    expect(openRate).toMatchObject({value: "44.0%", change: 10});
  });
});
