import "server-only";
import {createHmac, timingSafeEqual} from "node:crypto";

/** Signs "this person, this organisation" so an unsubscribe link can't be edited for someone else. */
function secret() {
  const key = process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error("Email links need GITHUB_TOKEN_ENCRYPTION_KEY to be set.");
  return key;
}
const sign = (payload: string) =>
  createHmac("sha256", secret()).update(`weekly-summary:${payload}`).digest("base64url");

export function unsubscribeToken(organisationId: string, userId: string) {
  const payload = Buffer.from(`${organisationId}.${userId}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string | null | undefined) {
  const [payload, signature] = String(token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload)),
    given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [organisationId, userId] = Buffer.from(payload, "base64url").toString().split(".");
  const uuid = /^[0-9a-f-]{36}$/i;
  return uuid.test(organisationId ?? "") && uuid.test(userId ?? "")
    ? {organisationId, userId}
    : null;
}
