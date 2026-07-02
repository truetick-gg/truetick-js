import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, rmSync } from "node:fs";

const CONFIG_DIR = join(homedir(), ".truetick");

export interface CliConfig { apiKey?: string; baseUrl?: string }
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const readConfigFile = (): CliConfig => {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
};

// resolveKey: env wins over config file. readFile injectable for tests.
export function resolveKey(readFile: () => CliConfig = readConfigFile): CliConfig {
  const file = readFile();
  return {
    apiKey: process.env.TRUETICK_API_KEY ?? file.apiKey,
    baseUrl: process.env.TRUETICK_API_URL ?? file.baseUrl,
  };
}

export function saveConfig(cfg: CliConfig): void {
  // Create dir + file owner-only from the start (no world-readable window for the credential).
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  chmodSync(CONFIG_DIR, 0o700); // tighten even if the dir pre-existed (mode is ignored by mkdir then)
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600); // ensure 0o600 even if the file pre-existed (mode only applies on create)
}

export function clearConfig(): void {
  try { rmSync(CONFIG_PATH, { force: true }); } catch { /* already gone */ }
}
