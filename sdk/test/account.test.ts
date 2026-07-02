import { describe, it, expect, vi } from "vitest";
import { Account } from "../src/account.js";

describe("Account", () => {
  it("caches whoami (one call for repeated id())", async () => {
    const http = { get: vi.fn(async () => ({ accountId: "acc-1" })) };
    const acc = new Account(http as any);
    expect(await acc.id()).toBe("acc-1");
    expect(await acc.id()).toBe("acc-1");
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith("/v1/whoami");
  });
});
