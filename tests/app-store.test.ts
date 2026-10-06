import {generateKeyPairSync, verify} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {
  appStoreAppId,
  AppStoreClient,
  AppStoreError,
  assertAppStoreRead,
} from "@/lib/integrations/app-store/client";
import {AppStoreConnector} from "@/lib/integrations/app-store/connector";
import {appStoreToken, parseAppStoreKey, storedAppStoreKey} from "@/lib/integrations/app-store/key";
import {translateAppStoreReview} from "@/lib/integrations/app-store/translator";
import {loadConnector} from "@/lib/integrations/loader";
import {providerRegistry} from "@/lib/integrations/registry";

const context = {
  organisationId: "11111111-1111-4111-8111-111111111111",
  integrationId: "22222222-2222-4222-8222-222222222222",
  receivedAt: "2026-10-04T00:00:00.000Z",
};
const fixedNow = () => new Date("2026-10-04T00:00:00.000Z");
const {privateKey, publicKey} = generateKeyPairSync("ec", {namedCurve: "prime256v1"});
const pem = privateKey.export({type: "pkcs8", format: "pem"}).toString();
const key = parseAppStoreKey({
  issuerId: "57246542-96FE-1A63-E053-0824D011072A",
  keyId: " 2x9r4hxf34 ",
  privateKey: pem,
});
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}});
const review = (id: string, createdDate: string, rating = 5) => ({
  id,
  attributes: {rating, title: "Great", body: "Love it", createdDate, territory: "GBR"},
});

describe("App Store connection", () => {
  it("checks the pasted key and signs a short-lived ES256 token Apple can verify", () => {
    expect(key.issuerId).toBe("57246542-96fe-1a63-e053-0824d011072a");
    expect(key.keyId).toBe("2X9R4HXF34");
    const token = appStoreToken(key, Date.parse("2026-10-04T00:00:00Z")),
      [header, payload, signature] = token.split(".");
    expect(decode(header)).toEqual({alg: "ES256", kid: "2X9R4HXF34", typ: "JWT"});
    const claims = decode(payload);
    expect(claims.aud).toBe("appstoreconnect-v1");
    expect(claims.iss).toBe(key.issuerId);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(20 * 60);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        {key: publicKey, dsaEncoding: "ieee-p1363"},
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(storedAppStoreKey(JSON.stringify(key))).toEqual(key);
    expect(() => parseAppStoreKey({...key, issuerId: "nope"})).toThrow(/Issuer ID/);
    expect(() => parseAppStoreKey({...key, privateKey: "-----BEGIN PRIVATE KEY-----\nxx"})).toThrow(
      /\.p8/,
    );
    const rsa = generateKeyPairSync("rsa", {modulusLength: 1024}).privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    expect(() => parseAppStoreKey({...key, privateKey: rsa})).toThrow(/App Store Connect API key/);
    expect(providerRegistry.app_store.capabilities).not.toContain("read_only");
    expect(providerRegistry.app_store.connectPath).toBe("/app/integrations/app-store/connect");
  });

  it("refuses review replies, writes, and other hosts", () => {
    expect(() =>
      assertAppStoreRead("https://api.appstoreconnect.apple.com/v1/customerReviewResponses", "GET"),
    ).toThrow(/reply/);
    expect(() =>
      assertAppStoreRead(
        "https://api.appstoreconnect.apple.com/v1/customerReviews/1/response",
        "GET",
      ),
    ).toThrow(/reply/);
    expect(() =>
      assertAppStoreRead("https://api.appstoreconnect.apple.com/v1/apps", "POST"),
    ).toThrow(/only reads/);
    expect(() => assertAppStoreRead("https://example.com/v1/apps", "GET")).toThrow(AppStoreError);
    expect(() =>
      assertAppStoreRead(
        "https://api.appstoreconnect.apple.com/v1/apps/123/customerReviews",
        "GET",
      ),
    ).not.toThrow();
    expect(() => appStoreAppId("../1")).toThrow(/not valid/);
  });

  it("lists apps and reads reviews without the reviewer name", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(new Headers(init?.headers).get("authorization"))).toMatch(
        /^Bearer .+\..+\..+$/,
      );
      if (String(url).includes("/v1/apps?"))
        return reply({
          data: [
            {id: "1234567890", attributes: {name: "Ghost", bundleId: "com.example.ghost"}},
            {id: "bad id", attributes: {name: "Nope"}},
          ],
        });
      return reply({
        data: [
          {
            ...review("r1", "2026-10-03T10:00:00-07:00", 2),
            attributes: {
              ...review("r1", "2026-10-03T10:00:00-07:00", 2).attributes,
              reviewerNickname: "Jo",
            },
          },
        ],
      });
    });
    const client = new AppStoreClient(key, request as typeof fetch);
    expect(await client.apps()).toEqual([
      {appId: "1234567890", name: "Ghost", bundleId: "com.example.ghost"},
    ]);
    const {reviews} = await client.reviews("1234567890");
    expect(reviews[0]).toMatchObject({reviewId: "r1", rating: 2, territory: "GBR"});
    const event = translateAppStoreReview(
      reviews[0],
      {appId: "1234567890", name: "Ghost"},
      context,
    );
    expect(event?.title).toBe("2-star review on Ghost");
    expect(event?.severity).toBe("warning");
    expect(event?.description).toBe("Great: Love it");
    expect(JSON.stringify(event)).not.toContain("Jo");
  });

  it("refuses a review page link that points away from Apple", async () => {
    const request = vi.fn(async () => reply({data: []}));
    const client = new AppStoreClient(key, request as typeof fetch);
    await expect(client.reviews("1", "https://evil.example/v1/apps")).rejects.toThrow(
      AppStoreError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("maps Apple errors to reconnect and permission messages", async () => {
    const client = (status: number) =>
      new AppStoreClient(key, (async () =>
        reply({errors: [{detail: "x"}]}, status)) as typeof fetch);
    await expect(client(401).apps()).rejects.toMatchObject({kind: "unauthorized"});
    await expect(client(403).apps()).rejects.toMatchObject({kind: "permission"});
    await expect(client(429).apps()).rejects.toMatchObject({kind: "rate_limit"});
  });

  it("syncs new reviews for chosen apps and remembers the newest", async () => {
    const request = vi.fn(async () =>
      reply({
        data: [review("new", "2026-10-03T00:00:00Z"), review("old", "2026-08-01T00:00:00Z")],
        links: {next: "https://api.appstoreconnect.apple.com/v1/apps/1/customerReviews?cursor=2"},
      }),
    );
    const connector = new AppStoreConnector(
      new AppStoreClient(key, request as typeof fetch),
      {apps: [{appId: "1", name: "Ghost", bundleId: "", selected: true}]},
      fixedNow,
    );
    const result = await connector.sync(context);
    expect(result.events.map((event) => event.externalId)).toEqual(["app_store:review:1:new"]);
    expect(result.filtered).toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.settings.lastReviewSeconds).toEqual({
      "1": Date.parse("2026-10-03T00:00:00Z") / 1000,
    });
    await expect(
      new AppStoreConnector(new AppStoreClient(key, request as typeof fetch), {apps: []}).sync(
        context,
      ),
    ).rejects.toThrow(/Choose at least one/);
  });

  it("loads from the stored key", () => {
    expect(
      loadConnector("app_store", {accessToken: JSON.stringify(key), settings: {}}).provider,
    ).toBe("app_store");
    expect(() => loadConnector("app_store", {})).toThrow(/missing/);
  });
});
