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
  it("warns when the server was not created by init (ephemeral false)", async () => {
    const client = { servers: { delete: vi.fn(async () => {}) } };
    const log = vi.fn();
    await runDown(client as any, { ...project, ephemeral: false }, { yes: true }, { log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not created by"));
    expect(client.servers.delete).toHaveBeenCalledWith("srv_a1");
  });
});
