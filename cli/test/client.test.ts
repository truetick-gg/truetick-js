import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { cliClient } from "../src/client.js";
import { defaultAuthIO, defaultDeviceDeps } from "../src/commands/auth.js";

// Read independently of src/: the header must name the versions being published.
const version = (rel: string) => (JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as { version: string }).version;

describe("cliClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the CLI and the SDK, with their versions, in User-Agent", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ accountId: "acc-1", email: "u@x.com", emailVerified: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await cliClient("ttk_x", "https://api.example").whoami();
    const init = (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1];
    expect(init.headers["user-agent"]).toBe(`truetick-cli/${version("../package.json")} truetick-sdk/${version("../../sdk/package.json")}`);
  });

  // Onboarding goes through the SDK's auth helpers, not cliClient; it has to
  // say it came from the CLI too, or the device flow reads as direct SDK use.
  it("signup, password login and the device flow name the CLI too", async () => {
    const minted = { api_key: "ttk_x", account_id: "acc-1", email: "u@x.com", email_verified: true, device_code: "d", user_code: "WXYZ-1234", verify_url: "https://p", status: "pending" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(minted), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const device = defaultDeviceDeps("https://api.example");
    await defaultAuthIO.signup("https://api.example", "u@x.com", "password1");
    await defaultAuthIO.login("https://api.example", "u@x.com", "password1");
    await device.start();
    await device.poll("d");
    const sent = (fetchMock.mock.calls as unknown as [string, { headers: Record<string, string> }][]).map(([url, init]) => [url, init.headers["user-agent"]]);
    const ua = `truetick-cli/${version("../package.json")} truetick-sdk/${version("../../sdk/package.json")}`;
    expect(sent).toEqual([
      ["https://api.example/v1/public/signup", ua],
      ["https://api.example/v1/public/login", ua],
      ["https://api.example/v1/public/device/start", ua],
      ["https://api.example/v1/public/device/poll", ua],
    ]);
  });
});
