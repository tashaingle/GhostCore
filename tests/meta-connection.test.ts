import {describe, expect, it} from "vitest";
import {pickMetaConnection} from "@/lib/integrations/meta/connection";

describe("pickMetaConnection", () => {
  const old = {id: "old", provider_account_id: "111"},
    other = {id: "other", provider_account_id: "222"};

  it("updates the connection for the same Facebook account", () => {
    expect(pickMetaConnection([old, other], "222")).toBe(other);
  });

  it("replaces the existing connection when the ID is new, such as after moving Meta app", () => {
    expect(pickMetaConnection([old, other], "333")).toBe(old);
  });

  it("starts a new connection when there isn't one", () => {
    expect(pickMetaConnection([], "333")).toBeNull();
  });
});
