import { describe, it, expect } from "vitest";
import { toBackup } from "../src/types.js";

// A backup says which path took it (R-N4 B1): the SDK passes kind and reason
// through instead of dropping them. proto3 JSON omits an empty reason.
describe("toBackup", () => {
  it("carries kind and reason", () => {
    const b = toBackup({ id: "b1", serverId: "s1", createdAt: "t", sizeBytes: "1024", kind: "preop", reason: "version-change" });
    expect(b.sizeBytes).toBe(1024);
    expect(b.kind).toBe("preop");
    expect(b.reason).toBe("version-change");
  });
  it("leaves them undefined for an older API", () => {
    const b = toBackup({ id: "b1", serverId: "s1", createdAt: "t", sizeBytes: "1" });
    expect(b.kind).toBeUndefined();
    expect(b.reason).toBeUndefined();
  });
});
