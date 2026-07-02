import { describe, it, expect, vi } from "vitest";
import { scanDeployLogs, confirmDeploy } from "../src/confirm.js";

describe("scanDeployLogs", () => {
  it("ok when the plugin reports enabled", () => {
    const v = scanDeployLogs(["[INFO]: [MyPlugin] Enabling MyPlugin v1.2.0", "[INFO]: Done (3.1s)!"], "MyPlugin");
    expect(v).toEqual({ ok: true, detail: expect.stringContaining("MyPlugin") });
  });
  it("fail on an exception stack", () => {
    const v = scanDeployLogs(["[ERROR]: Could not load 'plugins/MyPlugin.jar'", "java.lang.NoClassDefFoundError: foo/Bar"], "MyPlugin");
    expect(v?.ok).toBe(false);
  });
  it("null when inconclusive", () => {
    expect(scanDeployLogs(["[INFO]: Preparing spawn area: 42%"], "MyPlugin")).toBeNull();
  });
});

describe("confirmDeploy", () => {
  it("polls recentLogs until a verdict, threading the cursor", async () => {
    const recentLogs = vi.fn()
      .mockResolvedValueOnce({ lines: ["starting"], cursor: "c1", containerMissing: false })
      .mockResolvedValueOnce({ lines: ["[INFO]: [MyPlugin] Enabling MyPlugin v1.2.0"], cursor: "c2", containerMissing: false });
    const v = await confirmDeploy({ servers: { recentLogs } } as any, "srv_a1", "MyPlugin", {
      deadlineMs: 10_000, pollMs: 0, now: (() => { let t = 0; return () => (t += 100); })(), sleep: async () => {},
    });
    expect(v.ok).toBe(true);
    expect(recentLogs).toHaveBeenNthCalledWith(2, "srv_a1", { cursor: "c1" });
  });
  it("times out inconclusive", async () => {
    const recentLogs = vi.fn(async () => ({ lines: ["working"], cursor: "c", containerMissing: false }));
    const now = (() => { let t = 0; return () => (t += 6000); })();
    const v = await confirmDeploy({ servers: { recentLogs } } as any, "srv_a1", "MyPlugin", { deadlineMs: 5000, pollMs: 0, now, sleep: async () => {} });
    expect(v).toEqual({ ok: false, detail: expect.stringContaining("timed out") });
  });
  it("follows the provided cursor on the first poll (no stale tail scan)", async () => {
    const recentLogs = vi.fn().mockResolvedValueOnce({ lines: ["[INFO]: [MyPlugin] Enabling MyPlugin v2"], cursor: "c2", containerMissing: false });
    const v = await confirmDeploy({ servers: { recentLogs } } as any, "srv_a1", "MyPlugin", {
      cursor: "anchor", deadlineMs: 10_000, pollMs: 0, now: (() => { let t = 0; return () => (t += 100); })(), sleep: async () => {},
    });
    expect(recentLogs).toHaveBeenNthCalledWith(1, "srv_a1", { cursor: "anchor" });
    expect(v.ok).toBe(true);
  });
});
