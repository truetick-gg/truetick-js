import { TrueTickError } from "./errors.js";

const DEFAULT_BASE = "https://api.truetick.gg";
const envBase = (): string | undefined =>
  typeof process !== "undefined" ? process.env?.TRUETICK_API_URL : undefined;

export interface DevicePrompt { userCode: string; verificationUri: string; verificationUriComplete: string; expiresIn: number }
export interface SignInOptions {
  clientId: string;
  scope?: string;
  baseUrl?: string;
  onCode: (p: DevicePrompt) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const makeSleepAbortable = (signal?: AbortSignal) => async (ms: number) => {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new TrueTickError(0, "aborted", "sign-in aborted"));
    };
    signal?.addEventListener("abort", onAbort);
  });
};

/** Device sign-in (RFC 8628) for third-party apps. Resolves with a user-bound tta_ token. */
export async function signInWithDevice(o: SignInOptions): Promise<{ token: string; scope: string }> {
  const base = o.baseUrl ?? envBase() ?? DEFAULT_BASE;
  const sleep = o.sleep ?? makeSleepAbortable(o.signal);
  const scope = o.scope ?? "servers:list";
  try {
    const start = await fetch(`${base}/v1/public/device/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: o.clientId, scope }),
      signal: o.signal,
    });
    const s = await start.json().catch(() => null);
    if (!s) throw new TrueTickError(start.status, "bad_response", "unexpected response (" + start.status + ")");
    if (!start.ok) throw new TrueTickError(start.status, s.error ?? "device_start_failed", `device start failed: ${s.error ?? start.status}`);
    o.onCode({ userCode: s.user_code, verificationUri: s.verification_uri, verificationUriComplete: s.verification_uri_complete, expiresIn: s.expires_in });
    let interval = (s.interval ?? 5) * 1000;
    const deadline = Date.now() + (s.expires_in ?? 600) * 1000;
    while (Date.now() < deadline) {
      if (o.signal?.aborted) throw new TrueTickError(0, "aborted", "sign-in aborted");
      await sleep(interval);
      if (o.signal?.aborted) throw new TrueTickError(0, "aborted", "sign-in aborted");
      const p = await fetch(`${base}/v1/public/device/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: s.device_code }),
        signal: o.signal,
      });
      const b = await p.json().catch(() => null);
      if (p.ok && b?.access_token) return { token: b.access_token, scope: b.scope ?? scope };
      // Transient errors: retry
      if (p.status >= 500 || p.status === 429) continue;
      // Non-JSON response: bad_response
      if (!b) throw new TrueTickError(p.status, "bad_response", "unexpected response (" + p.status + ")");
      // RFC 8628 error codes
      switch (b.error) {
        case "authorization_pending": continue;
        case "slow_down": interval += 5000; continue;
        default: throw new TrueTickError(p.status, b.error ?? "sign_in_failed", `sign-in failed: ${b.error ?? p.status}`);
      }
    }
    throw new TrueTickError(400, "expired_token", "sign-in code expired");
  } catch (e) {
    if (e instanceof TrueTickError) throw e;
    if (e instanceof Error && (e.name === "AbortError" || o.signal?.aborted)) throw new TrueTickError(0, "aborted", "sign-in aborted");
    throw e;
  }
}

export interface MyServer {
  id: string;
  /**
   * What a player pastes into Minecraft (Java), "<hostname>:25565".
   * Absent or empty = the server is a private network backend with no public
   * address of its own: players join through the network's proxy.
   */
  address?: string;
  state: string; type?: string; version?: string; region?: string;
  role: "owner" | "member" | "limited";
  /** Present only when live stats are fresh; absent = unknown, not zero. */
  playersOnline?: number;
}

/** Client for a user-bound app token (tta_). Only whoAmI and listMyServers are reachable. */
export class AppClient {
  private base: string;
  constructor(private o: { token: string; baseUrl?: string }) {
    this.base = o.baseUrl ?? envBase() ?? DEFAULT_BASE;
  }
  private async get<T>(path: string): Promise<T> {
    const r = await fetch(`${this.base}${path}`, { headers: { authorization: `Bearer ${this.o.token}` } });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const code = r.status === 401 ? "unauthenticated" : r.status === 403 ? "permission_denied" : r.status === 429 ? "rate_limited" : r.status >= 500 ? "unavailable" : "http_" + r.status;
      throw new TrueTickError(r.status, code, body?.message ?? `request failed (${r.status})`);
    }
    if (!body) throw new TrueTickError(r.status, "bad_response", "unexpected response (" + r.status + ")");
    return body as T;
  }
  /** The signed-in user's email. An app token carries no account id. */
  whoAmI() {
    return this.get<{ email: string }>("/v1/whoami");
  }
  async listMyServers(): Promise<{ my: MyServer[]; shared: MyServer[] }> {
    const r = await this.get<{ my?: MyServer[]; shared?: MyServer[] }>("/v1/me/servers");
    return { my: r.my ?? [], shared: r.shared ?? [] };
  }
}
