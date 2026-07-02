import { describe, it, expect, vi } from "vitest";
import { runDeploy, realRunBuild } from "../src/commands/deploy.js";

const project = { server: "srv_a1", target: "plugins", build: "gradle build", artifact: "build/libs/*.jar", on_deploy: "restart" as const, ephemeral: true };

function deps(over: Partial<any> = {}) {
  return {
    runBuild: vi.fn(() => ({ ok: true, output: "" })),
    newestArtifact: vi.fn(() => "/repo/build/libs/My-1.2.0.jar"),
    upload: vi.fn(async () => {}),
    confirm: vi.fn(async () => ({ ok: true, detail: "Enabling My v1.2.0" })),
    log: vi.fn(),
    ...over,
  };
}

describe("runDeploy", () => {
  it("builds, enables sftp, uploads to target, restarts, confirms", async () => {
    const client = {
      servers: {
        enableSftp: vi.fn(async () => ({ host: "h", port: 2222, username: "srv_a1", password: "p" })),
        recentLogs: vi.fn(async () => ({ lines: [], cursor: "anchor-cursor", containerMissing: false })),
        restart: vi.fn(async () => ({ id: "srv_a1", state: "starting" })),
      },
    };
    const d = deps();
    const v = await runDeploy(client as any, project, "/repo", {}, d as any);
    expect(d.runBuild).toHaveBeenCalledWith("gradle build", "/repo");
    expect(client.servers.enableSftp).toHaveBeenCalledWith("srv_a1");
    expect(d.upload).toHaveBeenCalledWith({ host: "h", port: 2222, username: "srv_a1", password: "p" }, "/repo/build/libs/My-1.2.0.jar", "plugins/My-1.2.0.jar");
    expect(client.servers.recentLogs).toHaveBeenCalledWith("srv_a1", { tail: 0 });
    expect(client.servers.restart).toHaveBeenCalledWith("srv_a1");
    expect(d.confirm).toHaveBeenCalledWith(client, "srv_a1", "My-1.2.0", "anchor-cursor");
    expect(v.ok).toBe(true);
  });

  it("skips the build with --no-build", async () => {
    const client = { servers: { enableSftp: vi.fn(async () => ({ host: "h", port: 1, username: "u", password: "p" })), recentLogs: vi.fn(async () => ({ lines: [], cursor: "anchor-cursor", containerMissing: false })), restart: vi.fn(async () => ({})) } };
    const d = deps();
    await runDeploy(client as any, project, "/repo", { noBuild: true }, d as any);
    expect(d.runBuild).not.toHaveBeenCalled();
  });

  it("realRunBuild reports a non-empty error when the command is missing", () => {
    const r = realRunBuild("definitely-not-a-real-binary-xyz build", process.cwd());
    expect(r.ok).toBe(false);
    expect(r.output.length).toBeGreaterThan(0);
  });

  it("aborts before upload when the build fails", async () => {
    const client = { servers: { enableSftp: vi.fn(), restart: vi.fn() } };
    const d = deps({ runBuild: vi.fn(() => ({ ok: false, output: "compile error" })) });
    await expect(runDeploy(client as any, project, "/repo", {}, d as any)).rejects.toThrow(/build failed/);
    expect(client.servers.enableSftp).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });
});
