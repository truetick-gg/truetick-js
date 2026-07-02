import { describe, it, expect, vi } from "vitest";
import { buildProgram } from "../src/index.js";

function fakeClient() {
  return {
    servers: {
      list: vi.fn(async () => [{ id: "s1" }]),
      start: vi.fn(async () => ({ id: "s1", state: "starting" })),
      delete: vi.fn(async () => ({})),
      createFromTemplate: vi.fn(async () => ({ id: "s1" })),
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
});
