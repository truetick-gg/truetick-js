export interface MintedAuth {
  apiKey: string;
  accountId: string;
  email: string;
  emailVerified: boolean;
}

async function post(baseUrl: string, path: string, body: unknown): Promise<MintedAuth> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `request failed (${res.status})`;
    try { const e = await res.json(); if (e?.error) msg = e.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const r = await res.json();
  return { apiKey: r.api_key, accountId: r.account_id, email: r.email, emailVerified: !!r.email_verified };
}

export const signup = (baseUrl: string, email: string, password: string): Promise<MintedAuth> =>
  post(baseUrl, "/v1/public/signup", { email, password });

export const login = (baseUrl: string, email: string, password: string): Promise<MintedAuth> =>
  post(baseUrl, "/v1/public/login", { email, password });

export interface DeviceStart { deviceCode: string; userCode: string; verifyUrl: string }
export interface DevicePoll { status: string; apiKey?: string }

export async function deviceStart(baseUrl: string): Promise<DeviceStart> {
  const res = await fetch(`${baseUrl}/v1/public/device/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`device start failed (${res.status})`);
  const r = await res.json();
  return { deviceCode: r.device_code, userCode: r.user_code, verifyUrl: r.verify_url };
}

export async function devicePoll(baseUrl: string, deviceCode: string): Promise<DevicePoll> {
  const res = await fetch(`${baseUrl}/v1/public/device/poll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_code: deviceCode }) });
  if (!res.ok) throw new Error(`device poll failed (${res.status})`);
  const r = await res.json();
  return { status: r.status, apiKey: r.api_key };
}
