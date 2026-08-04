import {beforeEach, describe, expect, it} from "vitest";
import {providerRegistry} from "@/lib/integrations/registry";
import {
  META_SOCIAL_DEFAULT_VERSION,
  META_SOCIAL_PERMISSIONS,
} from "@/lib/integrations/meta-social/config";
import {authorisationUrl, stateMatches} from "@/lib/integrations/meta-social/oauth";
import {
  metaSocialFingerprint,
  translateMetaSocial,
} from "@/lib/integrations/meta-social/translator";
import type {SocialMetric} from "@/lib/integrations/meta-social/types";

beforeEach(() => {
  process.env.META_APP_ID = "app";
  process.env.META_APP_SECRET = "test-secret";
  process.env.META_SOCIAL_REDIRECT_URI =
    "http://localhost:3000/api/integrations/meta-social/callback";
  delete process.env.META_SOCIAL_GRAPH_API_VERSION;
});

const ctx = {
  organisationId: "org-a",
  integrationId: "integration-a",
  receivedAt: "2026-08-04T00:00:00Z",
};

const pageMetric: SocialMetric = {
  kind: "page_metric",
  platform: "facebook",
  assetId: "page-1",
  assetName: "Acme Page",
  entityId: "page-1",
  entityName: "Acme Page",
  date: "2026-08-03",
  metrics: {
    page_impressions: 1200,
    page_impressions_unique: 900,
    page_follows: 12,
    followers: 4400,
  },
};

const igMetric: SocialMetric = {
  kind: "instagram_metric",
  platform: "instagram",
  assetId: "ig-1",
  entityId: "ig-1",
  entityName: "acme",
  date: "2026-08-03",
  metrics: {reach: 500, impressions: 800, followers: 2100, profile_views: 40},
};

describe("Meta Social registration and OAuth", () => {
  it("is a real read-only marketing provider", () => {
    expect(providerRegistry.meta_social.connector).toBe("meta_social");
    expect(providerRegistry.meta_social.category).toBe("Marketing");
    expect(providerRegistry.meta_social.capabilities).toContain("read_only");
    expect(providerRegistry.meta_social.connectPath).toContain("meta-social");
  });

  it("requests only organic scopes (no ads write)", () => {
    expect(META_SOCIAL_PERMISSIONS).toContain("pages_read_engagement");
    expect(META_SOCIAL_PERMISSIONS).toContain("instagram_manage_insights");
    expect(META_SOCIAL_PERMISSIONS.join()).not.toMatch(/ads_management|pages_manage/i);
  });

  it("uses configurable graph default", () => {
    expect(META_SOCIAL_DEFAULT_VERSION).toBe("v25.0");
  });

  it("builds OAuth without embedding secrets", () => {
    const url = authorisationUrl("state");
    expect(url).toContain("/v25.0/dialog/oauth");
    expect(url).not.toContain("secret");
    expect(url).toContain("instagram_manage_insights");
  });

  it("validates state exactly", () => {
    expect(stateMatches("same", "same")).toBe(true);
    expect(stateMatches("same", "other")).toBe(false);
  });
});

describe("Meta Social deterministic events", () => {
  it("maps Facebook page daily performance", () => {
    const event = translateMetaSocial(pageMetric, ctx, metaSocialFingerprint(pageMetric));
    expect(event.source).toBe("meta_social");
    expect(event.eventType).toBe("meta_social.facebook.performance.daily_recorded");
    expect(event.metadata?.metrics).toMatchObject({page_impressions: 1200, followers: 4400});
    expect(event.metadata?.surface).toBe("organic_social");
  });

  it("maps Instagram account performance", () => {
    const event = translateMetaSocial(igMetric, ctx, metaSocialFingerprint(igMetric));
    expect(event.eventType).toBe("meta_social.instagram.performance.daily_recorded");
    expect(event.title).toContain("Instagram");
  });

  it("is organisation scoped and secret-free", () => {
    const revision = metaSocialFingerprint(pageMetric);
    expect(translateMetaSocial(pageMetric, ctx, revision).externalId).not.toBe(
      translateMetaSocial(pageMetric, {...ctx, organisationId: "org-b"}, revision).externalId,
    );
    const text = JSON.stringify(translateMetaSocial(pageMetric, ctx, revision));
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("app_secret");
  });

  it("fingerprints media metrics separately", () => {
    const media: SocialMetric = {
      kind: "media_metric",
      platform: "instagram",
      assetId: "ig-1",
      entityId: "media-9",
      entityName: "Reel",
      date: "2026-08-01",
      mediaType: "VIDEO",
      metrics: {views: 9000, likes: 120, comments: 8},
    };
    const event = translateMetaSocial(media, ctx, metaSocialFingerprint(media));
    expect(event.eventType).toBe("meta_social.media.performance_recorded");
    expect(event.metadata?.metrics).toMatchObject({views: 9000});
  });
});
