import {describe, expect, it} from "vitest";
import {normaliseWebAddress, optionalWebAddress} from "@/lib/forms/web-address";

describe("web addresses people type", () => {
  it("adds https:// when it's missing", () => {
    expect(normaliseWebAddress("xufu.co.uk")).toBe("https://xufu.co.uk/");
    expect(normaliseWebAddress("  www.xufu.co.uk ")).toBe("https://www.xufu.co.uk/");
    expect(normaliseWebAddress("xufu.co.uk/shop")).toBe("https://xufu.co.uk/shop");
  });

  it("keeps full addresses as they are", () => {
    expect(normaliseWebAddress("https://xufu.co.uk/")).toBe("https://xufu.co.uk/");
    expect(normaliseWebAddress("http://xufu.co.uk")).toBe("http://xufu.co.uk/");
  });

  it("allows blank, and rejects things that aren't websites", () => {
    expect(normaliseWebAddress("")).toBe("");
    for (const bad of ["xufu", "not a website", "ftp://xufu.co.uk", "javascript:alert(1)"])
      expect(normaliseWebAddress(bad)).toBeNull();
  });

  it("gives the field's own message when it's wrong", () => {
    const field = optionalWebAddress("That website doesn't look right.");
    expect(field.parse("xufu.co.uk")).toBe("https://xufu.co.uk/");
    const result = field.safeParse("xufu");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("That website doesn't look right.");
  });
});
