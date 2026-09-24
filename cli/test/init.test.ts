import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/commands/init.js";
import { runDown } from "../src/commands/down.js";
import { loadProject, saveProject } from "../src/project.js";
import { buildProgram } from "../src/index.js";

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
    // The cost notice ships in an npm tarball that can't be replaced, and only
    // this suite runs where it is published (npm test --workspaces). It said
    // "idle = scale-to-zero = free" (delta review F7), while an empty server
    // is billed until its idle timeout puts it to sleep: only asleep is free.
    const lines = d.log.mock.calls.map(([s]: [string]) => String(s));
    for (const l of lines) expect(l).not.toMatch(/\bidle\s*=[^.]*=\s*free\b|\bidle\s*[=-]\s*free\b/i);
    expect(lines.some((l) => l.includes("idle timeout") && l.includes("asleep costs nothing")), lines.join("\n")).toBe(true);
  });

  it("errors when neither --server nor --create is given", async () => {
    await expect(runInit({} as any, "/repo", {}, deps() as any)).rejects.toThrow(/--server|--create/);
  });

  // --server binds somebody's real server; --create makes a throwaway one that
  // `down` may delete. Both at once used to bind the real server but write
  // ephemeral = true, so `down --yes` then deleted it with its world, files and
  // backups (pkg-02). Nothing may be read, created or written for that pair.
  it("refuses --server together with --create and touches nothing", async () => {
    for (const opts of [{ server: "my-smp", create: true }, { server: "my-smp", create: true, name: "Dev", yes: true }]) {
      const client = { servers: { get: vi.fn(async () => ({ id: "my-smp", type: "PAPER" })), create: vi.fn(), delete: vi.fn() } };
      const d = deps();
      await expect(runInit(client as any, "/repo", opts, d as any)).rejects.toThrow("--server and --create can't be used together");
      expect(client.servers.get).not.toHaveBeenCalled();
      expect(client.servers.create).not.toHaveBeenCalled();
      expect(client.servers.delete).not.toHaveBeenCalled();
      expect(d.saveProject).not.toHaveBeenCalled();
    }
  });

  // A truetick.toml that CLI 0.1.x wrote for `init --server my-smp --create`
  // marks the real server ephemeral = true, and `down` goes by that flag alone.
  // docs-site/pages/libraries/cli.mdx tells such a user to re-run
  // `init --server <id>` before `down`; that advice holds only while init
  // rewrites the whole file with ephemeral = false, whatever it said before.
  it("re-running init --server over a 0.1.x file that marked the server ephemeral makes down refuse it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "truetick-init-"));
    try {
      writeFileSync(join(dir, "truetick.toml"),
        'server = "my-smp"\ntarget = "plugins"\nartifact = "*.jar"\non_deploy = "restart"\nephemeral = true\n');
      expect(loadProject(dir)?.ephemeral).toBe(true);
      const client = { servers: { get: vi.fn(async () => ({ id: "my-smp", type: "PAPER" })), delete: vi.fn() } };
      await runInit(client as any, dir, { server: "my-smp" }, { detectBuild: () => ({ artifact: "*.jar" }), saveProject, log: () => {} });
      const project = loadProject(dir)!;
      expect(project.ephemeral).toBe(false);
      await expect(runDown(client as any, project, { yes: true }, { log: () => {} })).rejects.toThrow(/refusing to delete my-smp/);
      expect(client.servers.delete).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The same cli.mdx warning says the re-run rewrites the WHOLE file: target
  // follows the server's type again, build and artifact are detected again,
  // on_deploy goes back to restart. Hand edits are lost, so the page offers
  // setting ephemeral = false by hand as the other way out (next test). If
  // init ever starts keeping the old fields, that warning has to change.
  it("init --server rewrites the whole truetick.toml: hand edits to target, build, artifact and on_deploy don't survive", async () => {
    const dir = mkdtempSync(join(tmpdir(), "truetick-init-"));
    try {
      writeFileSync(join(dir, "truetick.toml"),
        'server = "my-smp"\ntarget = "mods"\nbuild = "make jar"\nartifact = "out/*.jar"\non_deploy = "reload"\nephemeral = true\n');
      const client = { servers: { get: vi.fn(async () => ({ id: "my-smp", type: "PAPER" })) } };
      await runInit(client as any, dir, { server: "my-smp" }, { detectBuild: () => ({ artifact: "*.jar" }), saveProject, log: () => {} });
      expect(loadProject(dir)).toEqual({ server: "my-smp", target: "plugins", build: undefined, artifact: "*.jar", on_deploy: "restart", ephemeral: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a truetick.toml set to ephemeral = false by hand makes down refuse, and keeps its other fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "truetick-init-"));
    try {
      writeFileSync(join(dir, "truetick.toml"),
        'server = "my-smp"\ntarget = "mods"\nbuild = "make jar"\nartifact = "out/*.jar"\non_deploy = "reload"\nephemeral = false\n');
      const project = loadProject(dir)!;
      expect(project).toEqual({ server: "my-smp", target: "mods", build: "make jar", artifact: "out/*.jar", on_deploy: "reload", ephemeral: false });
      const client = { servers: { delete: vi.fn() } };
      await expect(runDown(client as any, project, { yes: true }, { log: () => {} })).rejects.toThrow(/refusing to delete my-smp/);
      expect(client.servers.delete).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("truetick init", () => {
  // The real command line, so the refusal also holds for how index.ts passes the
  // flags through. get rejects: a regression can't write a truetick.toml here.
  it("exits 1 on --server with --create before it reads any server", async () => {
    const client = { servers: { get: vi.fn(async () => { throw new Error("get must not be called"); }), create: vi.fn(), delete: vi.fn() } };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.exitCode;
    process.exitCode = 0;
    try {
      await buildProgram(() => client as any).parseAsync(["node", "truetick", "init", "--server", "my-smp", "--create"]);
      expect(process.exitCode).toBe(1);
      expect(client.servers.get).not.toHaveBeenCalled();
      expect(client.servers.create).not.toHaveBeenCalled();
      expect(String(errors.mock.calls[0]?.[0])).toBe("Error: --server and --create can't be used together: --server binds an existing server, --create makes a new dev server that `truetick down` may delete");
    } finally {
      process.exitCode = before;
      errors.mockRestore();
    }
  });
});
