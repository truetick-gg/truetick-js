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

// The API explains every refusal in the body: grpc-gateway answers
// {"code": <gRPC code>, "message": "...", "details": [...]}, the raw
// signup/login/device handlers answer {"error": "..."}, and the SSE log stream
// answers plain text. The SDK used to throw away all three and invent a
// sentence from the HTTP status alone (dev-01).
describe("Http refusals keep the server's own words", () => {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  async function refusal(res: Response, call: (h: Http) => Promise<unknown> = (h) => h.get("/v1/servers/s1")): Promise<TrueTickError> {
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const err = await call(new Http("https://api.example", "ttk_k")).then(() => undefined, (e) => e);
    expect(err).toBeInstanceOf(TrueTickError);
    return err as TrueTickError;
  }

  it("a gateway refusal carries the server's message and its gRPC code", async () => {
    const e = await refusal(json(400, { code: 9, message: "top up your wallet to start this server", details: [] }), (h) => h.post("/v1/servers/s1:start", {}));
    expect(e.status).toBe(400);
    expect(e.message).toBe("top up your wallet to start this server");
    expect(e.grpcCode).toBe("failed_precondition");
    expect(e.code).toBe("http_error");
    expect(e.details).toEqual([]);
  });

  it("a capacity refusal reads as capacity, not as a rate limit", async () => {
    const e = await refusal(json(429, { code: 8, message: "node at capacity", details: [] }), (h) => h.post("/v1/servers/s1:start", {}));
    expect(e.message).toBe("node at capacity");
    expect(e.grpcCode).toBe("resource_exhausted");
    expect(e.retryAfter).toBeUndefined();
  });

  it("an account mismatch is not reported as a missing scope", async () => {
    const e = await refusal(json(403, { code: 7, message: "account mismatch", details: [] }));
    expect(e.message).toBe("account mismatch");
    expect(e.grpcCode).toBe("permission_denied");
  });

  it("Retry-After in seconds becomes retryAfter", async () => {
    const e = await refusal(json(429, { error: "too many attempts, try again later" }, { "retry-after": "600" }));
    expect(e.retryAfter).toBe(600);
    expect(e.message).toBe("too many attempts, try again later");
    expect(e.grpcCode).toBeUndefined();
  });

  it("Retry-After as an HTTP date becomes seconds from now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    try {
      const e = await refusal(json(503, { code: 14, message: "unavailable" }, { "retry-after": "Wed, 23 Sep 2026 12:00:30 GMT" }));
      expect(e.retryAfter).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });

  // Anything else was handed to Date.parse, which reads "-5" and "+5" as
  // 2001-04-30 and "1.5" as 2001-01-04: a date in the past, so retryAfter 0,
  // and the retry recipe in /errors retried at once (pkg-05). A value that is
  // neither delay-seconds nor an IMF-fixdate now says nothing, and the caller's
  // own backoff applies.
  it("a Retry-After that is neither seconds nor an HTTP date leaves retryAfter unset", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    try {
      const bad = [
        "-5", "+5", "1.5", "60s", "",
        "2026-09-23T12:00:30Z", // ISO 8601, not an HTTP-date
        "Wed Sep 23 12:00:30 2026", // asctime: Date.parse reads it in local time
        "Wed, 31 Feb 2026 12:00:30 GMT", // no such day; Date.parse rolls it into March
        "Mon, 23 Sep 2026 12:00:30 GMT", // 23 Sep 2026 is a Wednesday
      ];
      for (const v of bad) {
        const e = await refusal(json(429, { code: 8, message: "rate limit exceeded", details: [] }, { "retry-after": v }));
        expect([v, e.retryAfter]).toEqual([v, undefined]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("Retry-After 0 and a date already past both mean retry now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    try {
      for (const v of ["0", "Wed, 23 Sep 2026 11:59:00 GMT"]) {
        const e = await refusal(json(429, { code: 8, message: "rate limit exceeded", details: [] }, { "retry-after": v }));
        expect([v, e.retryAfter]).toEqual([v, 0]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("the log stream's plain-text refusal becomes the message", async () => {
    const res = new Response("too many concurrent log streams for this key\n", { status: 429, headers: { "content-type": "text/plain; charset=utf-8" } });
    const e = await refusal(res, (h) => h.stream("/v1/servers/s1/logs/stream"));
    expect(e.message).toBe("too many concurrent log streams for this key");
  });

  // The log stream's key and ownership refusals are http.Error with nothing but
  // the status word ("unauthorized", "forbidden", "not found":
  // internal/api/sselogs.go). The SDK's own sentence for the status says more,
  // e.g. that a 403 there is a key without servers:read, so it is kept.
  it("a plain-text refusal that only repeats the status word keeps the SDK's explanation", async () => {
    const cases: [number, string, string][] = [
      [401, "unauthorized\n", "Invalid API key — check your ttk_ key."],
      [403, "forbidden\n", "Your API key lacks the required scope for this operation."],
      [404, "not found\n", "Not found — wrong server id or path."],
    ];
    for (const [status, body, sentence] of cases) {
      const res = new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
      const e = await refusal(res, (h) => h.stream("/v1/servers/s1/logs/stream"));
      expect(e.message).toBe(sentence);
    }
  });

  // "rate limit exceeded" is not the 429's status word; it is what tells the
  // rate limit from a capacity refusal, and the retry recipe in the docs keys on it.
  it("the log stream's rate-limit refusal keeps its words", async () => {
    const res = new Response("rate limit exceeded\n", { status: 429, headers: { "content-type": "text/plain; charset=utf-8" } });
    const e = await refusal(res, (h) => h.stream("/v1/servers/s1/logs/stream"));
    expect(e.message).toBe("rate limit exceeded");
  });

  it("an HTML error page never becomes the message", async () => {
    const e = await refusal(new Response("<html><body><h1>502 Bad Gateway</h1></body></html>", { status: 502, headers: { "content-type": "text/html" } }));
    expect(e.code).toBe("server_error");
    expect(e.message).toBe("TrueTick API server error.");
  });

  it("an empty body falls back to the status's own explanation", async () => {
    const e = await refusal(new Response(null, { status: 401 }));
    expect(e.message).toBe("Invalid API key — check your ttk_ key.");
    expect(e.grpcCode).toBeUndefined();
    expect(e.retryAfter).toBeUndefined();
  });
});
