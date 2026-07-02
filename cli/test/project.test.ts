import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject, saveProject, detectBuild, targetForType, newestArtifact } from "../src/project.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ttk-proj-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("targetForType", () => {
  it("maps server families to plugins or mods", () => {
    expect(targetForType("PAPER")).toBe("plugins");
    expect(targetForType("purpur")).toBe("plugins");
    expect(targetForType("FABRIC")).toBe("mods");
    expect(targetForType("NEOFORGE")).toBe("mods");
    expect(targetForType(undefined)).toBe("plugins"); // safe default
  });
});

describe("detectBuild", () => {
  it("detects gradle", () => {
    writeFileSync(join(dir, "build.gradle"), "");
    expect(detectBuild(dir)).toEqual({ build: "gradle build", artifact: "build/libs/*.jar" });
  });
  it("detects maven", () => {
    writeFileSync(join(dir, "pom.xml"), "");
    expect(detectBuild(dir)).toEqual({ build: "mvn -q package", artifact: "target/*.jar" });
  });
  it("falls back with no build command", () => {
    expect(detectBuild(dir)).toEqual({ build: undefined, artifact: "*.jar" });
  });
});

describe("loadProject / saveProject round-trip", () => {
  it("returns null when absent and round-trips when present", () => {
    expect(loadProject(dir)).toBeNull();
    const cfg = { server: "srv_a1", target: "plugins", build: "gradle build", artifact: "build/libs/*.jar", on_deploy: "restart" as const, ephemeral: true };
    saveProject(dir, cfg);
    expect(loadProject(dir)).toEqual(cfg);
  });
});

describe("newestArtifact", () => {
  it("picks the most-recently-modified jar and throws when none", () => {
    mkdirSync(join(dir, "build", "libs"), { recursive: true });
    const old = join(dir, "build/libs/old.jar");
    const recent = join(dir, "build/libs/new.jar");
    writeFileSync(old, "a"); writeFileSync(recent, "b");
    utimesSync(old, new Date(1000), new Date(1000));
    utimesSync(recent, new Date(2000), new Date(2000));
    expect(newestArtifact(dir, "build/libs/*.jar")).toBe(recent);
    expect(() => newestArtifact(dir, "dist/*.jar")).toThrow(/no artifact/);
  });
});
