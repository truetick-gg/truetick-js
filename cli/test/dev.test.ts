import { describe, it, expect, vi } from "vitest";
import { runDev } from "../src/commands/dev.js";

const project = { server: "srv_a1", target: "plugins", artifact: "build/libs/*.jar", on_deploy: "restart" as const, ephemeral: true };

describe("runDev", () => {
  it("deploys once on start and again per change event, debounced", async () => {
    const handlers: Record<string, (p: string) => void> = {};
    const watcher = {
      on: vi.fn((ev: string, cb: any) => { handlers[ev] = cb; return watcher; }),
      close: vi.fn(async () => {}),
    };
    const deploy = vi.fn(async () => ({ ok: true, detail: "ok" }));
    const stop = { signal: { aborted: false } as any, abort: () => {} };
    const deps = { watch: vi.fn(() => watcher), deploy, tail: vi.fn(async () => {}), log: vi.fn(), debounceMs: 0 };
    const p = runDev("/repo", project, {}, deps as any, stop as any);
    await Promise.resolve();
    handlers["add"]?.("/repo/build/libs/My.jar");
    await new Promise((r) => setTimeout(r, 5));
    stop.signal.aborted = true;
    handlers["add"]?.("/repo/build/libs/My.jar"); // ignored after abort
    await p;
    expect(deps.watch).toHaveBeenCalledWith("build/libs/*.jar", "/repo");
    expect(deploy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(watcher.close).toHaveBeenCalled();
  });
});
