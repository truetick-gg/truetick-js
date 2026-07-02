import { describe, it, expect, vi } from "vitest";
import { runInit } from "../src/commands/init.js";

function deps() {
  const saved: any[] = [];
  return {
    saved,
    detectBuild: vi.fn(() => ({ build: "gradle build", artifact: "build/libs/*.jar" })),
    saveProject: vi.fn((_cwd: string, cfg: any) => saved.push(cfg)),
    log: vi.fn(),
  };
}

describe("runInit", () => {
  it("binds to an existing server and writes the config", async () => {
    const client = { servers: { get: vi.fn(async () => ({ id: "srv_a1", type: "PAPER" })) } };
    const d = deps();
    const cfg = await runInit(client as any, "/repo", { server: "srv_a1" }, d as any);
    expect(client.servers.get).toHaveBeenCalledWith("srv_a1");
    expect(cfg).toMatchObject({ server: "srv_a1", target: "plugins", build: "gradle build", artifact: "build/libs/*.jar", on_deploy: "restart", ephemeral: false });
    expect(d.saved[0]).toEqual(cfg);
  });

  it("refuses --create without --yes (no server created)", async () => {
    const create = vi.fn();
    const client = { servers: { createFromTemplate: create, create } };
    await expect(runInit(client as any, "/repo", { create: true, name: "Dev", ram: 4096 }, deps() as any)).rejects.toThrow(/--yes/);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates an ephemeral metered server with --create --yes and marks ephemeral", async () => {
    const client = { servers: { create: vi.fn(async () => ({ id: "srv_new", type: "FABRIC" })) } };
    const d = deps();
    const cfg = await runInit(client as any, "/repo", { create: true, yes: true, name: "Dev", ram: 4096, type: "FABRIC", version: "1.21.4" }, d as any);
    expect(client.servers.create).toHaveBeenCalledWith({ name: "Dev", ramMb: 4096, type: "FABRIC", version: "1.21.4", plan: "metered", region: undefined });
    expect(cfg).toMatchObject({ server: "srv_new", target: "mods", ephemeral: true });
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("metered"));
    expect(d.log.mock.invocationCallOrder[0]).toBeLessThan(client.servers.create.mock.invocationCallOrder[0]);
  });

  it("errors when neither --server nor --create is given", async () => {
    await expect(runInit({} as any, "/repo", {}, deps() as any)).rejects.toThrow(/--server|--create/);
  });
});
