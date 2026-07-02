import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrueTickClient } from "../src/client.js";

// Helper: create a ReadableStream<Uint8Array> that emits the given chunks in sequence.
function chunkStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const encoded = chunks.map(c => enc.encode(c));
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i < encoded.length) ctrl.enqueue(encoded[i++]);
      else ctrl.close();
    },
  });
}

function client(baseUrl = "https://api.example") {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    if (url.endsWith("/v1/whoami")) return new Response(JSON.stringify({ accountId: "acc-1" }), { status: 200 });
    if (url.endsWith("/v1/templates")) return new Response(JSON.stringify({ templates: [{ id: "paper-survival", ramMb: "2048" }] }), { status: 200 });
    if (url.includes("/v1/servers?account_id=")) return new Response(JSON.stringify({ servers: [{ id: "s1", ramMb: "4096" }] }), { status: 200 });
    if (url.endsWith("/v1/servers/s1:command")) return new Response(JSON.stringify({ output: "pong" }), { status: 200 });
    if (url.includes("/v1/servers/s1/files")) return new Response(JSON.stringify({ entries: [{ name: "server.properties", isDir: false, size: "12345" }] }), { status: 200 });
    if (url.includes("/v1/templates/") && url.endsWith(":create")) return new Response(JSON.stringify({ id: "my-server", hostname: "my-server", container: "mc_my-server", addr: "", state: "stopped" }), { status: 200 });
    return new Response(JSON.stringify({ id: "myserver", hostname: "myserver", container: "mc_myserver", addr: "", state: "stopped" }), { status: 200 });
  }));
  return new TrueTickClient({ apiKey: "ttk_x", baseUrl });
}

describe("TrueTickClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("servers.list injects whoami account + coerces int64 ramMb to number", async () => {
    const servers = await client().servers.list();
    expect((fetch as any).mock.calls.some((c: any[]) => c[0] === "https://api.example/v1/servers?account_id=acc-1")).toBe(true);
    expect(servers[0].ramMb).toBe(4096); // number, not "4096"
  });

  it("console.run posts to :command", async () => {
    const r = await client().console.run("s1", "ping");
    expect((fetch as any).mock.calls.some((c: any[]) => c[0] === "https://api.example/v1/servers/s1:command")).toBe(true);
    expect(r.output).toBe("pong");
  });

  it("servers.create derives id/hostname/container/addr from name and posts them", async () => {
    await client("https://api.truetick.gg").servers.create({ name: "My Server!", ramMb: 2048 });
    const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0].endsWith("/v1/servers") && c[1].method === "POST");
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall[1].body);
    expect(body.id).toBe("my-server");
    expect(body.hostname).toBe("my-server.truetick.gg");
    expect(body.container).toBe("mc_my-server");
    expect(body.addr).toBe("");
    expect(body.accountId).toBe("acc-1");
    expect(body.ramMb).toBe(2048);
  });

  it("servers.create uses bare id as hostname when baseUrl has no api-like domain", async () => {
    await client("http://localhost:8080").servers.create({ name: "test", ramMb: 1024 });
    const postCall = (fetch as any).mock.calls.find((c: any[]) => c[0].endsWith("/v1/servers") && c[1].method === "POST");
    const body = JSON.parse(postCall[1].body);
    expect(body.id).toBe("test");
    expect(body.hostname).toBe("test");
  });

  it("servers.create throws when name has no valid characters", async () => {
    await expect(client().servers.create({ name: "---!!!", ramMb: 1024 })).rejects.toThrow(/letters or numbers/);
  });

  it("files.list coerces int64 size string to number", async () => {
    const entries = await client().files.list("s1", "/");
    expect(entries[0].size).toBe(12345);
    expect(typeof entries[0].size).toBe("number");
    expect(entries[0].isDir).toBe(false);
    expect(entries[0].name).toBe("server.properties");
  });

  it("templates.list routes to /v1/templates", async () => {
    await client().templates.list();
    expect((fetch as any).mock.calls.some((c: any[]) => c[0] === "https://api.example/v1/templates")).toBe(true);
  });

  it("createFromTemplate posts to :create with name+overrides", async () => {
    await client().servers.createFromTemplate("paper-survival", "My Server", { ramMb: 4096 });
    const call = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith("/v1/templates/paper-survival:create"));
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).toEqual({ name: "My Server", overrides: { ramMb: 4096 } });
  });
});

describe("servers.recentLogs", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("GETs /logs with tail+cursor, injects x-api-key header, maps response", async () => {
    const payload = { lines: ["a", "b"], cursor: "c1", containerMissing: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => new Response(JSON.stringify(payload), { status: 200 })));

    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example" });
    const result = await c.servers.recentLogs("srv1", { tail: 50, cursor: "cur" });

    const calls: any[][] = (fetch as any).mock.calls;
    const logCall = calls.find(([url]) => String(url).includes("/logs"));
    expect(logCall).toBeTruthy();
    expect(logCall[0]).toBe("https://api.example/v1/servers/srv1/logs?tail=50&cursor=cur");
    expect(logCall[1].headers["x-api-key"]).toBe("ttk_test");
    expect(result).toEqual({ lines: ["a", "b"], cursor: "c1", containerMissing: false });
  });

  it("omits absent query params (no tail, no cursor)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lines: [], cursor: "", containerMissing: false }), { status: 200 })));
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example" });
    await c.servers.recentLogs("srv2");
    const calls: any[][] = (fetch as any).mock.calls;
    const logCall = calls.find(([url]) => String(url).includes("/logs"));
    expect(logCall[0]).toBe("https://api.example/v1/servers/srv2/logs");
  });
});

describe("servers.streamLogs", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("yields data lines, skips heartbeat comments, handles chunk-split boundaries", async () => {
    // Split the SSE body across two chunks — the word "data" is cut in half to prove buffer works.
    // Chunk 1 ends with "dat", chunk 2 begins with "a: b\n\n".
    const body = chunkStream("data: a\n\n: ping\n\ndat", "a: b\n\n");

    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) =>
      new Response(body as any, { status: 200 }),
    ));

    const c = new TrueTickClient({ apiKey: "ttk_stream", baseUrl: "https://api.example" });
    const lines: string[] = [];
    for await (const line of c.servers.streamLogs("srv1", { tail: 100 })) {
      lines.push(line);
    }

    expect(lines).toEqual(["a", "b"]);

    const calls: any[][] = (fetch as any).mock.calls;
    const streamCall = calls.find(([url]) => String(url).includes("/logs/stream"));
    expect(streamCall).toBeTruthy();
    expect(streamCall[0]).toBe("https://api.example/v1/servers/srv1/logs/stream?tail=100");
    expect(streamCall[1].headers["x-api-key"]).toBe("ttk_stream");
  });

  it("returns an async iterable (has Symbol.asyncIterator)", () => {
    // No fetch stub needed — just checking shape before consumption.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(chunkStream() as any, { status: 200 })));
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example" });
    const iterable = c.servers.streamLogs("srv1");
    expect(typeof (iterable as any)[Symbol.asyncIterator]).toBe("function");
  });
});

describe("servers.enableSftp", () => {
  it("POSTs the enable-sftp RPC and maps the credential (int32 port coerced)", async () => {
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example.com" });
    const post = vi.fn(async () => ({ host: "na.truetick.gg", port: "2222", username: "srv_a1", password: "s3cret" }));
    // Reach into the private http to stub post (same approach as existing client tests).
    (c as any).http = { post, get: vi.fn(), del: vi.fn(), stream: vi.fn() };
    const cred = await c.servers.enableSftp("srv_a1");
    expect(post).toHaveBeenCalledWith("/v1/servers/srv_a1:enable-sftp", {});
    expect(cred).toEqual({ host: "na.truetick.gg", port: 2222, username: "srv_a1", password: "s3cret" });
  });
});

describe("billing.createCheckout", () => {
  it("posts to account checkout-link path and maps the url", async () => {
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example.com" });
    const post = vi.fn(async () => ({ checkoutUrl: "https://checkout.paddle.com/x" }));
    (c as any).http = { post, get: vi.fn(), del: vi.fn(), stream: vi.fn() };
    (c as any).account = { id: async () => "acc-1" };
    const out = await c.billing.createCheckout(10);
    expect(post).toHaveBeenCalledWith("/v1/accounts/acc-1/checkout-link", { amountUsd: 10 });
    expect(out).toEqual({ checkoutUrl: "https://checkout.paddle.com/x" });
  });

  it("maps snake_case checkout_url fallback", async () => {
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example.com" });
    const post = vi.fn(async () => ({ checkout_url: "https://checkout.paddle.com/y" }));
    (c as any).http = { post, get: vi.fn(), del: vi.fn(), stream: vi.fn() };
    (c as any).account = { id: async () => "acc-1" };
    const out = await c.billing.createCheckout(20);
    expect(post).toHaveBeenCalledWith("/v1/accounts/acc-1/checkout-link", { amountUsd: 20 });
    expect(out).toEqual({ checkoutUrl: "https://checkout.paddle.com/y" });
  });
});

describe("whoami", () => {
  it("maps emailVerified from server response (grpc-gateway camelCase)", async () => {
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example.com" });
    const get = vi.fn(async () => ({ accountId: "acc-1", email: "u@x.com", emailVerified: true }));
    (c as any).http = { get, post: vi.fn(), del: vi.fn(), stream: vi.fn() };
    const w = await c.whoami();
    expect(get).toHaveBeenCalledWith("/v1/whoami");
    expect(w).toEqual({ accountId: "acc-1", email: "u@x.com", emailVerified: true });
  });

  it("coerces absent emailVerified to false", async () => {
    const c = new TrueTickClient({ apiKey: "ttk_test", baseUrl: "https://api.example.com" });
    const get = vi.fn(async () => ({ accountId: "acc-2", email: "v@y.com" }));
    (c as any).http = { get, post: vi.fn(), del: vi.fn(), stream: vi.fn() };
    const w = await c.whoami();
    expect(w.emailVerified).toBe(false);
  });
});
