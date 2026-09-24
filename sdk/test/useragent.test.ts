import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { TrueTickClient, signup, login, deviceStart, devicePoll } from "../src/index.js";

// Read independently of src/: the header must name the version being published.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

function captureFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accountId: "acc-1", email: "u@x.com", emailVerified: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers["user-agent"];
}

describe("User-Agent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the SDK and its package.json version", async () => {
    const ua = captureFetch();
    await new TrueTickClient({ apiKey: "ttk_x", baseUrl: "https://api.example" }).whoami();
    expect(ua()).toBe(`truetick-sdk/${pkg.version}`);
  });

  it("puts the caller's own product token first", async () => {
    const ua = captureFetch();
    await new TrueTickClient({ apiKey: "ttk_x", baseUrl: "https://api.example", userAgent: "my-bot/1.2" }).whoami();
    expect(ua()).toBe(`my-bot/1.2 truetick-sdk/${pkg.version}`);
  });

  it("is sent by the unauthenticated auth helpers too", async () => {
    const ua = captureFetch();
    await signup("https://api.example", "u@x.com", "password1");
    expect(ua()).toBe(`truetick-sdk/${pkg.version}`);
  });

  // The CLI onboards through these helpers (signup, password login, device
  // flow); without a product token of its own that traffic reads as direct SDK use.
  it("the auth helpers put the caller's own product token first too", async () => {
    const opts = { userAgent: "truetick-cli/9.9.9" };
    const calls: [string, () => Promise<unknown>][] = [
      ["signup", () => signup("https://api.example", "u@x.com", "password1", opts)],
      ["login", () => login("https://api.example", "u@x.com", "password1", opts)],
      ["deviceStart", () => deviceStart("https://api.example", opts)],
      ["devicePoll", () => devicePoll("https://api.example", "d", opts)],
    ];
    for (const [name, call] of calls) {
      const ua = captureFetch();
      await call();
      expect([name, ua()]).toEqual([name, `truetick-cli/9.9.9 truetick-sdk/${pkg.version}`]);
    }
  });

  // A header the page sets is not CORS-safelisted, and User-Agent is no
  // exception: Firefox sends it, so it lands in the preflight's
  // Access-Control-Request-Headers, which the API's allow-list (authorization,
  // x-api-key, content-type) refuses, and every call fails (pkg-07). A browser
  // sends its own User-Agent anyway, so the SDK adds none in a page or a worker.
  describe("in a browser", () => {
    function captureHeaders() {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accountId: "acc-1", email: "u@x.com", emailVerified: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      return () => (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers;
    }
    const calls: [string, () => Promise<unknown>][] = [
      ["client", () => new TrueTickClient({ apiKey: "ttk_x", baseUrl: "https://api.example", userAgent: "my-page/1.0" }).whoami()],
      ["signup", () => signup("https://api.example", "u@x.com", "password1")],
      ["login", () => login("https://api.example", "u@x.com", "password1")],
      ["deviceStart", () => deviceStart("https://api.example")],
      ["devicePoll", () => devicePoll("https://api.example", "d")],
    ];
    const browsers: [string, string, unknown][] = [
      ["a page", "window", {}],
      ["a worker", "importScripts", () => {}],
    ];

    for (const [where, global, value] of browsers) {
      it(`sends no User-Agent from ${where}`, async () => {
        vi.stubGlobal(global, value);
        for (const [name, call] of calls) {
          const headers = captureHeaders();
          await call();
          expect([name, Object.keys(headers()).some((h) => h.toLowerCase() === "user-agent")]).toEqual([name, false]);
        }
      });
    }

    it("still sends the API key and content type from a page", async () => {
      vi.stubGlobal("window", {});
      const headers = captureHeaders();
      await new TrueTickClient({ apiKey: "ttk_x", baseUrl: "https://api.example" }).whoami();
      expect(headers()).toEqual({ "x-api-key": "ttk_x", "content-type": "application/json" });
    });
  });
});
