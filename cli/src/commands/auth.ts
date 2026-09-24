import { signup as realSignup, login as realLogin, deviceStart, devicePoll, MintedAuth } from "@truetick/sdk";
import open from "open";
import { saveConfig } from "../config.js";
import { CLI_USER_AGENT } from "../version.js";

// Onboarding goes through the SDK's auth helpers rather than cliClient, so it
// names the CLI itself.
const asCli = { userAgent: CLI_USER_AGENT };

export interface AuthIO {
  signup: (baseUrl: string, email: string, password: string) => Promise<MintedAuth>;
  login: (baseUrl: string, email: string, password: string) => Promise<MintedAuth>;
  save: (cfg: { apiKey: string; baseUrl: string }) => void;
  log: (s: string) => void;
}

export const defaultAuthIO: AuthIO = {
  signup: (baseUrl, email, password) => realSignup(baseUrl, email, password, asCli),
  login: (baseUrl, email, password) => realLogin(baseUrl, email, password, asCli),
  save: (cfg) => saveConfig(cfg),
  log: (s) => console.log(s),
};

export async function runSignup(io: AuthIO, baseUrl: string, email: string, password: string): Promise<void> {
  const m = await io.signup(baseUrl, email, password);
  io.save({ apiKey: m.apiKey, baseUrl });
  io.log(`Account created for ${m.email}. Key saved to ~/.truetick/config.json.`);
  io.log("Verify your email — we sent you a link. Run `truetick whoami` to check status.");
}

export async function runLoginPassword(io: AuthIO, baseUrl: string, email: string, password: string): Promise<void> {
  const m = await io.login(baseUrl, email, password);
  io.save({ apiKey: m.apiKey, baseUrl });
  io.log(`Logged in as ${m.email}.`);
}

export interface DeviceLoginDeps {
  start: () => Promise<{ deviceCode: string; userCode: string; verifyUrl: string }>;
  poll: (deviceCode: string) => Promise<{ status: string; apiKey?: string }>;
  openBrowser: (url: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  log: (s: string) => void;
  save: (cfg: { apiKey: string; baseUrl: string }) => void;
  deadlineMs: number;
  pollMs: number;
  now?: () => number;
}

export function defaultDeviceDeps(baseUrl: string): DeviceLoginDeps {
  return {
    start: () => deviceStart(baseUrl, asCli),
    poll: (deviceCode) => devicePoll(baseUrl, deviceCode, asCli),
    // Just attempt to open the browser — any failure throws and is handled in
    // runDeviceLogin's single non-fatal layer (which prints the URL via deps.log).
    openBrowser: async (url) => {
      await open(url);
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (s) => console.log(s),
    save: (cfg) => saveConfig(cfg),
    deadlineMs: 5 * 60 * 1000, // 5 minutes
    pollMs: 2000,               // 2 seconds
  };
}

export async function runDeviceLogin(deps: DeviceLoginDeps, baseUrl: string): Promise<void> {
  const { deviceCode, userCode, verifyUrl } = await deps.start();
  const now = deps.now ?? (() => Date.now());
  const deadline = now() + deps.deadlineMs;

  deps.log(`Visit ${verifyUrl} and enter ${userCode}`);
  try {
    await deps.openBrowser(verifyUrl);
  } catch {
    deps.log(`(Could not open browser automatically — open the URL above manually.)`);
  }

  let warnedTransient = false;
  while (now() < deadline) {
    let result: { status: string; apiKey?: string };
    try {
      result = await deps.poll(deviceCode);
    } catch {
      // A transient poll failure (429 back-off, 5xx, a 404 blip) must NOT abort the
      // login — only expiry or the deadline are terminal. Warn at most once, then
      // keep polling until the deadline.
      if (!warnedTransient) {
        deps.log("(Still waiting for approval…)");
        warnedTransient = true;
      }
      await deps.sleep(deps.pollMs);
      continue;
    }
    if (result.status === "approved") {
      if (!result.apiKey) throw new Error("Device login approved but no API key returned.");
      deps.save({ apiKey: result.apiKey, baseUrl });
      deps.log("Logged in. Key saved to ~/.truetick/config.json.");
      return;
    }
    if (result.status === "expired") {
      throw new Error("Device login code expired. Run `truetick login` again.");
    }
    await deps.sleep(deps.pollMs);
  }

  throw new Error("Device login timed out. Run `truetick login` again.");
}
