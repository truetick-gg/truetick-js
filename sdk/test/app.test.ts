import { describe, it, expect, vi, afterEach } from "vitest";
import { signInWithDevice, AppClient } from "../src/app";
import { TrueTickError } from "../src/errors";

const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
afterEach(() => vi.unstubAllGlobals());

describe("signInWithDevice", () => {
  it("honours pending and slow_down, then returns the token", async () => {
    const replies = [
      res(200, { device_code: "d", user_code: "ABCD-1234", verification_uri: "https://truetick.gg/device", verification_uri_complete: "https://truetick.gg/device?code=ABCD-1234", expires_in: 600, interval: 5 }),
      res(400, { error: "authorization_pending" }),
      res(400, { error: "slow_down" }),
      res(200, { access_token: "tta_x", token_type: "Bearer", scope: "servers:list" }),
    ];
    const fetchMock = vi.fn(async () => replies.shift());
    vi.stubGlobal("fetch", fetchMock);
    const waits: number[] = [];
    const onCode = vi.fn();
    const out = await signInWithDevice({ clientId: "demo", onCode, baseUrl: "https://api.example", sleep: async (ms) => { waits.push(ms); } });
    expect(out).toEqual({ token: "tta_x", scope: "servers:list" });
    expect(onCode).toHaveBeenCalledWith({ userCode: "ABCD-1234", verificationUri: "https://truetick.gg/device", verificationUriComplete: "https://truetick.gg/device?code=ABCD-1234", expiresIn: 600 });
    expect(waits).toEqual([5000, 5000, 10000]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ client_id: "demo", scope: "servers:list" });
  });

  it("throws on access_denied", async () => {
    const replies = [
      res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v?code=U", expires_in: 600, interval: 5 }),
      res(400, { error: "access_denied" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift()));
    await expect(signInWithDevice({ clientId: "demo", onCode: () => {}, sleep: async () => {} })).rejects.toMatchObject({ code: "access_denied" });
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    const replies = [res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v", expires_in: 600, interval: 5 })];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift() ?? res(400, { error: "authorization_pending" })));
    const p = signInWithDevice({ clientId: "demo", onCode: () => ac.abort(), signal: ac.signal, sleep: async () => {} });
    await expect(p).rejects.toMatchObject({ code: "aborted" });
  });

  it("aborts during sleep without waiting interval", async () => {
    const ac = new AbortController();
    const replies = [res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v", expires_in: 600, interval: 5 })];
    const fetchMock = vi.fn(async () => replies.shift() ?? res(400, { error: "authorization_pending" }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = signInWithDevice({ clientId: "demo", onCode: () => {}, signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
  });

  it("aborts fetch mid-flight when signal fires", async () => {
    const ac = new AbortController();
    const replies = [res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v", expires_in: 600, interval: 5 })];
    let pollAbortReject: ((e: Error) => void) | null = null;
    const fetchMock = vi.fn(async (url: string, opts: any) => {
      if (url.includes("poll")) {
        return new Promise((_, reject) => {
          pollAbortReject = reject;
          opts.signal?.addEventListener("abort", () => {
            const abortErr = new Error("The operation was aborted");
            (abortErr as any).name = "AbortError";
            reject(abortErr);
          });
        });
      }
      return replies.shift();
    });
    vi.stubGlobal("fetch", fetchMock);
    const promise = signInWithDevice({ clientId: "demo", onCode: () => {}, signal: ac.signal, sleep: async () => {} });
    setTimeout(() => ac.abort(), 0);
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
  });

  it("cleans up abort listeners after successful sign-in", async () => {
    vi.useFakeTimers();
    try {
      const replies = [
        res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v", expires_in: 10, interval: 1 }),
        res(400, { error: "authorization_pending" }),
        res(200, { access_token: "tta_x", scope: "servers:list" }),
      ];
      vi.stubGlobal("fetch", vi.fn(async () => replies.shift()));
      let addCount = 0, removeCount = 0;
      const mockSignal = {
        addEventListener: (type: string, fn: any) => { addCount++; },
        removeEventListener: (type: string, fn: any) => { removeCount++; },
        aborted: false,
      };
      const promise = signInWithDevice({ clientId: "demo", onCode: () => {}, signal: mockSignal as any });
      await vi.runAllTimersAsync();
      await promise;
      expect(addCount).toBe(removeCount);
      expect(addCount).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries 503 until deadline", async () => {
    const replies = [
      res(200, { device_code: "d", user_code: "U", verification_uri: "v", verification_uri_complete: "v", expires_in: 2, interval: 1 }),
      res(503, {}),
      res(200, { access_token: "tta_x", scope: "servers:list" }),
    ];
    const fetchMock = vi.fn(async () => replies.shift());
    vi.stubGlobal("fetch", fetchMock);
    const out = await signInWithDevice({ clientId: "demo", onCode: () => {}, sleep: async () => {} });
    expect(out.token).toBe("tta_x");
  });
});

describe("AppClient", () => {
  it("sends the bearer and normalises lists", async () => {
    const fetchMock = vi.fn(async () => res(200, { my: [{ id: "a", address: "a.truetick.gg:25565", state: "running", role: "owner", playersOnline: 2 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const c = new AppClient({ token: "tta_x", baseUrl: "https://api.example" });
    const r = await c.listMyServers();
    expect(r.shared).toEqual([]);
    expect(r.my[0].playersOnline).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example/v1/me/servers");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer tta_x");
  });
  it("passes an empty address through (private network backend — join via the network's proxy)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(200, { my: [{ id: "lobby", address: "", state: "running", role: "owner" }] })));
    const r = await new AppClient({ token: "tta_x", baseUrl: "https://api.example" }).listMyServers();
    expect(r.my[0].address).toBe("");
  });
  it("maps 401 to unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(401, { message: "invalid or missing token" })));
    await expect(new AppClient({ token: "tta_bad" }).listMyServers()).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });
  it("maps 403 to permission_denied", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(403, { message: "forbidden" })));
    await expect(new AppClient({ token: "tta_x" }).listMyServers()).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  });
  it("handles HTML 503 response as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => { throw new Error("not json"); } })));
    await expect(new AppClient({ token: "tta_x" }).listMyServers()).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
  it("throws bad_response for 2xx with non-JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } })));
    await expect(new AppClient({ token: "tta_x" }).listMyServers()).rejects.toMatchObject({ status: 200, code: "bad_response" });
  });
});
