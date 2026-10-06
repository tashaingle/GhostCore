import "server-only";
import {createPrivateKey, sign, type KeyObject} from "node:crypto";
import {APP_STORE_LIMITS} from "./config";
import type {AppStoreKey} from "./types";

const ISSUER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Z0-9]{8,12}$/;

export class AppStoreKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppStoreKeyError";
  }
}

function privateKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new AppStoreKeyError(
      "That private key could not be read. Paste the whole .p8 file, including the BEGIN and END lines.",
    );
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1")
    throw new AppStoreKeyError(
      "That isn't an App Store Connect API key. Use the .p8 file Apple gave you.",
    );
  return key;
}

/** Checks a pasted key before anything is saved or sent to Apple. */
export function parseAppStoreKey(input: {
  issuerId?: unknown;
  keyId?: unknown;
  privateKey?: unknown;
}): AppStoreKey {
  const issuerId = String(input.issuerId ?? "")
      .trim()
      .toLowerCase(),
    keyId = String(input.keyId ?? "")
      .trim()
      .toUpperCase(),
    pem = String(input.privateKey ?? "")
      .replace(/\r\n/g, "\n")
      .trim();
  if (!ISSUER.test(issuerId))
    throw new AppStoreKeyError(
      "The Issuer ID should look like 57246542-96fe-1a63-e053-0824d011072a.",
    );
  if (!KEY_ID.test(keyId))
    throw new AppStoreKeyError("The Key ID should be about 10 letters and numbers.");
  if (pem.length > 4000 || !pem.includes("PRIVATE KEY"))
    throw new AppStoreKeyError("Paste the whole .p8 file, including the BEGIN and END lines.");
  privateKey(pem);
  return {issuerId, keyId, privateKey: `${pem}\n`};
}

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A short-lived ES256 token for the App Store Connect API. */
export function appStoreToken(key: AppStoreKey, now = Date.now()) {
  const iat = Math.floor(now / 1000),
    unsigned = `${part({alg: "ES256", kid: key.keyId, typ: "JWT"})}.${part({
      iss: key.issuerId,
      iat,
      exp: iat + APP_STORE_LIMITS.tokenSeconds,
      aud: "appstoreconnect-v1",
    })}`,
    signature = sign("sha256", Buffer.from(unsigned), {
      key: privateKey(key.privateKey),
      dsaEncoding: "ieee-p1363",
    });
  return `${unsigned}.${signature.toString("base64url")}`;
}

export function storedAppStoreKey(value: string): AppStoreKey {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new AppStoreKeyError(
      "The saved App Store key can't be read. Connect the App Store again.",
    );
  }
  return parseAppStoreKey((raw ?? {}) as Partial<AppStoreKey>);
}
