import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, isAbsolute, normalize } from "node:path";
import { parse, stringify } from "smol-toml";
import { globSync } from "tinyglobby";

export interface ProjectConfig {
  server: string;
  target: string;
  build?: string;
  artifact: string;
  on_deploy: "restart" | "reload";
  ephemeral?: boolean;
}

const PROJECT_FILE = "truetick.toml";

export function loadProject(cwd: string): ProjectConfig | null {
  const p = join(cwd, PROJECT_FILE);
  if (!existsSync(p)) return null;
  const raw = parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  return {
    server: String(raw.server ?? ""),
    target: String(raw.target ?? "plugins"),
    build: raw.build == null ? undefined : String(raw.build),
    artifact: String(raw.artifact ?? "*.jar"),
    on_deploy: raw.on_deploy === "reload" ? "reload" : "restart",
    ephemeral: raw.ephemeral == null ? undefined : raw.ephemeral === true,
  };
}

export function saveProject(cwd: string, cfg: ProjectConfig): void {
  // Drop undefined keys so the TOML stays clean.
  const obj: Record<string, unknown> = {
    server: cfg.server, target: cfg.target, artifact: cfg.artifact, on_deploy: cfg.on_deploy,
  };
  if (cfg.build !== undefined) obj.build = cfg.build;
  if (cfg.ephemeral !== undefined) obj.ephemeral = cfg.ephemeral;
  writeFileSync(join(cwd, PROJECT_FILE), stringify(obj) + "\n");
}

const PLUGIN_TYPES = new Set(["PAPER", "PURPUR", "SPIGOT", "BUKKIT", "FOLIA"]);

export function targetForType(type: string | undefined): "plugins" | "mods" {
  const t = (type ?? "").toUpperCase();
  if (["FABRIC", "FORGE", "NEOFORGE", "QUILT"].includes(t)) return "mods";
  if (PLUGIN_TYPES.has(t)) return "plugins";
  return "plugins"; // safe default: most casual dev targets are plugins
}

export function detectBuild(cwd: string): { build?: string; artifact: string } {
  if (existsSync(join(cwd, "build.gradle")) || existsSync(join(cwd, "build.gradle.kts")))
    return { build: "gradle build", artifact: "build/libs/*.jar" };
  if (existsSync(join(cwd, "pom.xml")))
    return { build: "mvn -q package", artifact: "target/*.jar" };
  return { build: undefined, artifact: "*.jar" };
}

export function newestArtifact(cwd: string, glob: string): string {
  const matches = globSync(glob, { cwd, absolute: true });
  if (matches.length === 0) throw new Error(`no artifact matches ${glob}`);
  let newest = matches[0];
  let best = statSync(newest).mtimeMs;
  for (const m of matches.slice(1)) {
    const mt = statSync(m).mtimeMs;
    if (mt > best) { best = mt; newest = m; }
  }
  return normalize(isAbsolute(newest) ? newest : join(cwd, newest));
}
