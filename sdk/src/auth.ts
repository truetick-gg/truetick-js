import { TrueTickError, errorFor, errorFromResponse, readRefusal } from "./errors.js";
import { userAgentHeader, userAgentWith } from "./http.js";

/** Options for the standalone auth helpers. */
export interface AuthOptions {
  /** Your own product token, sent ahead of the SDK's: "my-cli/1.0" → "my-cli/1.0 truetick-sdk/<version>". Not sent from a browser, which sets its own. */
  userAgent?: string;
}

const headers = (opts: AuthOptions) => ({ "content-type": "application/json", ...userAgentHeader(userAgentWith(opts.userAgent)) });

export interface MintedAuth {
  apiKey: string;
  accountId: string;
  email: string;
  emailVerified: boolean;
}

async function post(baseUrl: string, path: string, body: unknown, opts: AuthOptions): Promise<MintedAuth> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(opts),
    body: JSON.stringify(body),
  });
  // A login/signup refusal carries {"error": "..."} and, when rate-limited,
  // Retry-After. Without a body the generic per-status text would talk about
  // an API key these endpoints never take, so fall back to the plain status.
  if (!res.ok) throw await errorFromResponse(res, `request failed (${res.status})`);
  const r = await res.json();
  return { apiKey: r.api_key, accountId: r.account_id, email: r.email, emailVerified: !!r.email_verified };
}

export const signup = (baseUrl: string, email: string, password: string, opts: AuthOptions = {}): Promise<MintedAuth> =>
  post(baseUrl, "/v1/public/signup", { email, password }, opts);

export const login = (baseUrl: string, email: string, password: string, opts: AuthOptions = {}): Promise<MintedAuth> =>
  post(baseUrl, "/v1/public/login", { email, password }, opts);

export interface DeviceStart { deviceCode: string; userCode: string; verifyUrl: string }
export interface DevicePoll { status: string; apiKey?: string }

// deviceError keeps which step failed and adds the server's reason and
// Retry-After ("device start failed (429): too many requests").
async function deviceError(res: Response, step: string): Promise<TrueTickError> {
  const said = await readRefusal(res);
  const msg = `${step} failed (${res.status})${said.message ? `: ${said.message}` : ""}`;
  return new TrueTickError(res.status, errorFor(res.status).code, msg, said);
}

export async function deviceStart(baseUrl: string, opts: AuthOptions = {}): Promise<DeviceStart> {
  const res = await fetch(`${baseUrl}/v1/public/device/start`, { method: "POST", headers: headers(opts), body: "{}" });
  if (!res.ok) throw await deviceError(res, "device start");
  const r = await res.json();
  return { deviceCode: r.device_code, userCode: r.user_code, verifyUrl: r.verify_url };
}

export async function devicePoll(baseUrl: string, deviceCode: string, opts: AuthOptions = {}): Promise<DevicePoll> {
  const res = await fetch(`${baseUrl}/v1/public/device/poll`, { method: "POST", headers: headers(opts), body: JSON.stringify({ device_code: deviceCode }) });
  if (!res.ok) throw await deviceError(res, "device poll");
  const r = await res.json();
  return { status: r.status, apiKey: r.api_key };
}
