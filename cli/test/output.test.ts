import { describe, it, expect, vi } from "vitest";
import { TrueTickError } from "@truetick/sdk";
import { printResult, printError } from "../src/output.js";

describe("printResult", () => {
  it("prints JSON when json=true", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult({ a: 1 }, true);
    expect(spy.mock.calls[0][0]).toBe(JSON.stringify({ a: 1 }, null, 2));
    spy.mockRestore();
  });
  it("prints a table for an array when json=false", () => {
    const spy = vi.spyOn(console, "table").mockImplementation(() => {});
    printResult([{ id: "s1" }], false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// A capacity refusal and the per-key rate limit are both HTTP 429, so the
// status-derived code says "rate_limited" for both. The gRPC code the server
// sent is the honest label; Retry-After is the one number worth printing (dev-01).
describe("printError", () => {
  function printed(err: unknown): string {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    printError(err);
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    return line;
  }

  it("labels a refusal with the gRPC code the server sent", () => {
    const err = new TrueTickError(429, "rate_limited", "node at capacity", { grpcCode: "resource_exhausted" });
    expect(printed(err)).toBe("Error (resource_exhausted): node at capacity");
  });

  it("keeps the status-derived code when the body carried no gRPC status", () => {
    const err = new TrueTickError(401, "unauthorized", "Invalid API key — check your ttk_ key.");
    expect(printed(err)).toBe("Error (unauthorized): Invalid API key — check your ttk_ key.");
  });

  it("says how long to wait when the server sent Retry-After", () => {
    const err = new TrueTickError(429, "rate_limited", "too many signups, try again later", { retryAfter: 3600 });
    expect(printed(err)).toBe("Error: too many signups, try again later (retry after 3600s)");
  });

  // The onboarding endpoints and the log stream answer without a gRPC code, and
  // from HTTP 429 alone "rate_limited" is a guess: a password login at the
  // 25-key cap printed "Error (rate_limited): api key limit reached …", a limit
  // that never clears by itself (pkg-04). Such a 429 carries its message only.
  it("gives a 429 without a gRPC code no label: the key limit is not a rate limit", () => {
    const err = new TrueTickError(429, "rate_limited", "api key limit reached (max 25 per account); revoke an unused key first");
    expect(printed(err)).toBe("Error: api key limit reached (max 25 per account); revoke an unused key first");
  });
});
