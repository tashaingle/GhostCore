import {beforeEach, describe, expect, it, vi} from "vitest";
import {TikTokClient, TikTokError} from "@/lib/integrations/tiktok/client";
import {TIKTOK_SCOPES} from "@/lib/integrations/tiktok/config";
import {TikTokConnector} from "@/lib/integrations/tiktok/connector";
import {tiktokAuthorisationUrl, tiktokStateMatches} from "@/lib/integrations/tiktok/oauth";
import {translateTikTokVideo} from "@/lib/integrations/tiktok/translator";
import {loadConnector} from "@/lib/integrations/loader";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "2222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-03T00:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-03T00:00:00.000Z");

beforeEach(() => {
  process.env.TIKTOK_CLIENT_KEY = "awtestkey";
  process.env.TIKTOK_CLIENT_SECRET = "super-secret";
  process.env.TIKTOK_REDIRECT_URI = "http://localhost:3000/api/integrations/tiktok/callback";
});

describe("TikTok connection", () => {
  it("asks only for read scopes and keeps the secret out of the url", () => {
    const url = tiktokAuthorisationUrl("state.one");
    expect(url).toContain("https://www.tiktok.com/v2/auth/authorize/");
    for (const scope of TIKTOK_SCOPES) expect(url).toContain(scope);
    expect(url).not.toMatch(/video\.publish|video\.upload|super-secret/);
    expect(tiktokStateMatches("same", "same")).toBe(true);
    expect(tiktokStateMatches("same", "bad")).toBe(false);
  });

  it("treats an invalid token as expired access and never puts the token in the url", async () => {
    const request = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).not.toContain("act.secret");
      return new Response(JSON.stringify({error: {code: "access_token_invalid", message: "no"}}), {
        status: 401,
      });
    });
    const client = new TikTokClient({accessToken: "act.secret"}, request as typeof fetch);
    await expect(client.profile(["user.info.basic"])).rejects.toMatchObject({
      kind: "unauthorized",
    } as TikTokError);
  });

  it("records a daily account check and a new post, without the caption text", async () => {
    const created = Math.floor(fixedNow().getTime() / 1000) - 3600;
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      expect(href).not.toContain("act.secret");
      if (href.includes("fields=open_id"))
        return new Response(
          JSON.stringify({
            data: {user: {open_id: "open-1", display_name: "Ada"}},
            error: {code: "ok"},
          }),
          {status: 200},
        );
      if (href.includes("username"))
        return new Response(
          JSON.stringify({data: {user: {username: "ada"}}, error: {code: "ok"}}),
          {status: 200},
        );
      if (href.includes("follower_count"))
        return new Response(
          JSON.stringify({
            data: {user: {follower_count: 1200, likes_count: 40, video_count: 3}},
            error: {code: "ok"},
          }),
          {status: 200},
        );
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          data: {
            videos: [
              {
                id: "vid-1",
                title: "hello <script>",
                video_description: "do not store this caption",
                create_time: created,
                share_url: "https://www.tiktok.com/@ada/video/1",
                view_count: 10,
                like_count: 2,
              },
              {
                id: "vid-old",
                title: "old",
                create_time: created - 40 * 86400,
                share_url: "https://evil.example/phish",
              },
            ],
          },
          error: {code: "ok"},
        }),
        {status: 200},
      );
    });
    const connector = new TikTokConnector(
      new TikTokClient({accessToken: "act.secret"}, request as typeof fetch),
      {scopes: [...TIKTOK_SCOPES], openId: "open-1"},
      fixedNow,
    );
    const result = await connector.sync(context);
    expect(result.events.map((event) => event.eventType)).toEqual([
      "tiktok.account.performance_recorded",
      "tiktok.video.published",
    ]);
    const serialized = JSON.stringify(result.events);
    expect(serialized).not.toContain("do not store this caption");
    expect(serialized).not.toContain("evil.example");
    expect(serialized).not.toContain("<script>");
    expect(result.events[1]?.metadata).toMatchObject({url: "https://www.tiktok.com/@ada/video/1"});
  });

  it("still connects when TikTok has not approved video access", () => {
    const event = translateTikTokVideo(
      {id: "vid-1", createTime: 1_700_000_000, title: "Hello"},
      {...context, receivedAt: context.receivedAt},
    );
    expect(event.externalId).toBe("tiktok:video:vid-1");
    expect(event.rawPayload).toEqual({});
  });

  it("loads from the registry only when a token is present", () => {
    expect(
      loadConnector("tiktok", {accessToken: "act.token", settings: {scopes: ["user.info.basic"]}})
        .provider,
    ).toBe("tiktok");
    expect(() => loadConnector("tiktok")).toThrow(/TikTok credentials/);
  });
});
