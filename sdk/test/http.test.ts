import { describe, it, expect, vi } from "vitest";
import { Http } from "../src/http.js";
import { TrueTickError } from "../src/errors.js";

describe("Http", () => {
  it("sends x-api-key and parses JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new Http("https://api.example", "ttk_abc").get("/v1/whoami");
    expect(r).toEqual({ ok: 1 });
    expect((fetchMock.mock.calls[0][1] as any).headers["x-api-key"]).toBe("ttk_abc");
  });
  it("throws TrueTickError with status+code", async () => {
    const cases: [number, string][] = [[401,"unauthorized"],[403,"forbidden"],[404,"not_found"],[429,"rate_limited"],[500,"server_error"]];
    for (const [status, code] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status })));
      try { await new Http("https://api.example", "k").get("/v1/servers"); expect.fail("no throw"); }
      catch (e) { expect(e).toBeInstanceOf(TrueTickError); expect((e as TrueTickError).status).toBe(status); expect((e as TrueTickError).code).toBe(code); }
    }
  });
});
