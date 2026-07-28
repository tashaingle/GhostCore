import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const value = process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("GitHub token encryption is not configured.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptToken(token:string) {
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");
}

export function decryptToken(value:string) {
  const [version,iv,tag,ciphertext]=value.split(".");
  if(version!=="v1"||!iv||!tag||!ciphertext)throw new Error("Stored GitHub credentials are invalid.");
  try {
    const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
    decipher.setAuthTag(Buffer.from(tag,"base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8");
  } catch { throw new Error("Stored GitHub credentials could not be decrypted."); }
}
