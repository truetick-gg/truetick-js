import { describe, it, expect, vi } from "vitest";
import { runDown } from "../src/commands/down.js";

const project = { server: "srv_a1", target: "plugins", artifact: "*.jar", on_deploy: "restart" as const, ephemeral: true };

describe("runDown", () => {
  it("refuses without --yes", async () => {
    const client = { servers: { delete: vi.fn() } };
    await expect(runDown(client as any, project, { yes: false }, { log: vi.fn() })).rejects.toThrow(/--yes/);
    expect(client.servers.delete).not.toHaveBeenCalled();
  });
  it("deletes the bound server with --yes", async () => {
    const client = { servers: { delete: vi.fn(async () => {}) } };
    await runDown(client as any, project, { yes: true }, { log: vi.fn() });
    expect(client.servers.delete).toHaveBeenCalledWith("srv_a1");
  });
  it("refuses a server that init --create did not make (ephemeral false), even with --yes", async () => {
    const client = { servers: { delete: vi.fn(async () => {}) } };
    const log = vi.fn();
    await expect(runDown(client as any, { ...project, ephemeral: false }, { yes: true }, { log })).rejects.toThrow(/does not mark it ephemeral/);
    expect(client.servers.delete).not.toHaveBeenCalled();
  });

  // `init --server <id>` binds a real server and writes ephemeral = false; a
  // hand-written truetick.toml may carry no ephemeral key at all. Neither was
  // made by the dev-loop, so neither may be deleted by its last step (dev-03).
  it("refuses a truetick.toml without an ephemeral key", async () => {
    const client = { servers: { delete: vi.fn(async () => {}) } };
    const bound = { server: "srv_a1", target: "plugins", artifact: "*.jar", on_deploy: "restart" as const };
    await expect(runDown(client as any, bound, { yes: true }, { log: vi.fn() })).rejects.toThrow(/does not mark it ephemeral/);
    expect(client.servers.delete).not.toHaveBeenCalled();
  });

  it("points a bound server at the explicit delete command instead of asking for --yes", async () => {
    const client = { servers: { delete: vi.fn(async () => {}) } };
    const err = await runDown(client as any, { ...project, ephemeral: false }, { yes: false }, { log: vi.fn() }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("truetick servers delete srv_a1 --yes");
    expect((err as Error).message).not.toMatch(/without --yes/);
    expect(client.servers.delete).not.toHaveBeenCalled();
  });
});
