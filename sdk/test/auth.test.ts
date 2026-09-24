import { describe, it, expect, vi } from "vitest";
import { signup, login, deviceStart, devicePoll, TrueTickError } from "../src/index.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }));
}

describe("signup/login (unauthenticated)", () => {
  it("signup posts and maps the minted key", async () => {
    const f = mockFetch(200, { api_key: "ttk_x", account_id: "acc-1", email: "u@x.com", email_verified: false });
    vi.stubGlobal("fetch", f);
    const m = await signup("https://api.example.com", "u@x.com", "password1");
    expect(f).toHaveBeenCalledWith("https://api.example.com/v1/public/signup", expect.objectContaining({ method: "POST" }));
    expect(m).toEqual({ apiKey: "ttk_x", accountId: "acc-1", email: "u@x.com", emailVerified: false });
    vi.unstubAllGlobals();
  });

  it("signup throws the server error message on non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(409, { error: "email already registered" }));
    await expect(signup("https://api.example.com", "u@x.com", "password1")).rejects.toThrow(/already registered/);
    vi.unstubAllGlobals();
  });

  it("login posts to the correct endpoint and maps the minted key", async () => {
    const f = mockFetch(200, { api_key: "ttk_y", account_id: "acc-2", email: "v@y.com", email_verified: true });
    vi.stubGlobal("fetch", f);
    const m = await login("https://api.example.com", "v@y.com", "secret");
    expect(f).toHaveBeenCalledWith("https://api.example.com/v1/public/login", expect.objectContaining({ method: "POST" }));
    expect(m).toEqual({ apiKey: "ttk_y", accountId: "acc-2", email: "v@y.com", emailVerified: true });
    vi.unstubAllGlobals();
  });
});

describe("device-flow (unauthenticated)", () => {
  it("deviceStart maps the grant", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ device_code: "d", user_code: "WXYZ-1234", verify_url: "https://p/cli-auth?code=WXYZ-1234" }) })));
    const g = await deviceStart("https://api.example.com");
    expect(g).toEqual({ deviceCode: "d", userCode: "WXYZ-1234", verifyUrl: "https://p/cli-auth?code=WXYZ-1234" });
    vi.unstubAllGlobals();
  });

  it("deviceStart throws on non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(400, { error: "bad request" }));
    await expect(deviceStart("https://api.example.com")).rejects.toThrow(/device start failed/);
    vi.unstubAllGlobals();
  });

  it("devicePoll maps status and api_key", async () => {
    const f = mockFetch(200, { status: "authorized", api_key: "ttk_cli_z" });
    vi.stubGlobal("fetch", f);
    const p = await devicePoll("https://api.example.com", "d");
    expect(f).toHaveBeenCalledWith("https://api.example.com/v1/public/device/poll", expect.objectContaining({ method: "POST" }));
    expect(p).toEqual({ status: "authorized", apiKey: "ttk_cli_z" });
    vi.unstubAllGlobals();
  });

  it("devicePoll maps pending status without api_key", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "pending" }));
    const p = await devicePoll("https://api.example.com", "d");
    expect(p).toEqual({ status: "pending", apiKey: undefined });
    vi.unstubAllGlobals();
  });

  it("devicePoll throws on non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(404, {}));
    await expect(devicePoll("https://api.example.com", "d")).rejects.toThrow(/device poll failed/);
    vi.unstubAllGlobals();
  });
});

// The raw onboarding handlers rate-limit per IP and say for how long in
// Retry-After (3600 s for signups, 60 s for device starts). The SDK kept the
// {"error"} text for signup/login but dropped the header, and threw only
// "device start failed (429)" for the device flow (dev-01).
describe("auth refusals keep the server's words and Retry-After", () => {
  const refusal = (status: number, error: string, retryAfter: string) =>
    vi.fn(async () => new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "retry-after": retryAfter } }));

  it("a rate-limited signup is a TrueTickError with the server's text and retryAfter", async () => {
    vi.stubGlobal("fetch", refusal(429, "too many signups, try again later", "3600"));
    const e = await signup("https://api.example.com", "u@x.com", "password1").then(() => undefined, (x) => x);
    expect(e).toBeInstanceOf(TrueTickError);
    expect(e.status).toBe(429);
    expect(e.message).toBe("too many signups, try again later");
    expect(e.retryAfter).toBe(3600);
    vi.unstubAllGlobals();
  });

  it("a refused device start says why and for how long", async () => {
    vi.stubGlobal("fetch", refusal(429, "too many requests", "60"));
    const e = await deviceStart("https://api.example.com").then(() => undefined, (x) => x);
    expect(e).toBeInstanceOf(TrueTickError);
    expect(e.message).toMatch(/device start failed/);
    expect(e.message).toContain("too many requests");
    expect(e.retryAfter).toBe(60);
    vi.unstubAllGlobals();
  });

  it("a refused device poll says why", async () => {
    vi.stubGlobal("fetch", refusal(429, "slow down", "5"));
    const e = await devicePoll("https://api.example.com", "d").then(() => undefined, (x) => x);
    expect(e).toBeInstanceOf(TrueTickError);
    expect(e.message).toMatch(/device poll failed/);
    expect(e.message).toContain("slow down");
    expect(e.retryAfter).toBe(5);
    vi.unstubAllGlobals();
  });
});
