import {afterEach,expect,it} from "vitest";
import {decryptToken,encryptToken} from "@/lib/security/token-crypto";
const previous=process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
afterEach(()=>{if(previous===undefined)delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;else process.env.GITHUB_TOKEN_ENCRYPTION_KEY=previous});
it("encrypts GitHub tokens with authenticated encryption",()=>{process.env.GITHUB_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString("base64");const encrypted=encryptToken("gho_example_secret");expect(encrypted).not.toContain("gho_example_secret");expect(decryptToken(encrypted)).toBe("gho_example_secret")});
it("rejects an invalid encryption key",()=>{process.env.GITHUB_TOKEN_ENCRYPTION_KEY="short";expect(()=>encryptToken("secret")).toThrow(/32-byte/)});
