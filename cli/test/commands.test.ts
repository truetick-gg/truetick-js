import { describe, it, expect, vi } from "vitest";
import { buildProgram } from "../src/index.js";

function fakeClient() {
  return {
    servers: {
      list: vi.fn(async () => [{ id: "s1" }]),
      start: vi.fn(async () => ({ id: "s1", state: "starting" })),
      delete: vi.fn(async () => ({})),
      createFromTemplate: vi.fn(async () => ({ id: "s1" })),
      metrics: vi.fn(async () => ({ tps: 17.55, tpsSource: "TPS_SOURCE_MEASURED", players: 3, live: true })),
      tickHistory: vi.fn(async () => ({ minutes: [], hours: 24 })),
    },
    templates: {
      list: vi.fn(async () => []),
    },
    console: { run: vi.fn(async () => ({ output: "ok" })) },
    whoami: vi.fn(async () => ({ accountId: "acc-1" })),
  };
}

describe("CLI commands", () => {
  it("servers list calls sdk and prints", async () => {
    const c = fakeClient();
    const spy = vi.spyOn(console, "table").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "list"]);
    expect(c.servers.list).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("console passes id + command to sdk", async () => {
    const c = fakeClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "console", "s1", "say hi"]);
    expect(c.console.run).toHaveBeenCalledWith("s1", "say hi");
  });
  it("servers delete without --yes refuses and does not call sdk", async () => {
    process.exitCode = 0;
    const c = fakeClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "delete", "s1"]);
    expect(c.servers.delete).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it("servers delete with --yes calls sdk", async () => {
    process.exitCode = 0;
    const c = fakeClient();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "delete", "s1", "--yes"]);
    expect(c.servers.delete).toHaveBeenCalledWith("s1");
    expect(process.exitCode).not.toBe(1);
  });

  it("templates list calls sdk", async () => {
    const c = fakeClient();
    vi.spyOn(console, "table").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "templates", "list"]);
    expect(c.templates.list).toHaveBeenCalled();
  });

  it("servers create --template routes to createFromTemplate", async () => {
    const c = fakeClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "create", "--template", "paper-survival", "--name", "My Server", "--ram", "4096"]);
    expect(c.servers.createFromTemplate).toHaveBeenCalledWith("paper-survival", "My Server", { ramMb: 4096 });
  });

  // The two commands added with ADR-0060. What can actually break here is
  // argument wiring — the id reaching the SDK, and --hours arriving as a
  // NUMBER rather than the string commander hands over. Neither needs a live
  // API, and until these existed the commands would have shipped to npm
  // having never once been executed.
  it("servers metrics passes the id to the sdk", async () => {
    const c = fakeClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "metrics", "s1"]);
    expect(c.servers.metrics).toHaveBeenCalledWith("s1");
  });

  it("servers tick-history passes --hours through as a number", async () => {
    const c = fakeClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "tick-history", "s1", "--hours", "48"]);
    // Not toHaveBeenCalledWith("s1", { hours: "48" }): commander yields the
    // raw string, and the RPC field is an int32. A string would serialise into
    // the query as "48" and happen to work, then stop working the day anything
    // does arithmetic on it — so the coercion is the assertion.
    expect(c.servers.tickHistory).toHaveBeenCalledWith("s1", { hours: 48 });
  });

  it("servers tick-history without --hours sends no window and lets the server default", async () => {
    const c = fakeClient();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(() => c as any).parseAsync(["node", "truetick", "servers", "tick-history", "s1"]);
    // undefined, not { hours: 0 } or { hours: NaN }: the RPC treats an unset
    // window as "default to 24h", and a fabricated 0 would clamp to 1 hour
    // instead — a silently different window than the one the user asked for.
    expect(c.servers.tickHistory).toHaveBeenCalledWith("s1", undefined);
  });
});
