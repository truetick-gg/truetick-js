import { errorFromResponse } from "./errors.js";
import { SDK_USER_AGENT } from "./version.js";

/** The User-Agent a request carries: the caller's own product token, when there is one, ahead of the SDK's. */
export function userAgentWith(own?: string): string {
  return own ? `${own} ${SDK_USER_AGENT}` : SDK_USER_AGENT;
}

// A browser page or worker: a window or document, or the importScripts every
// worker scope has.
function inBrowser(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown; importScripts?: unknown };
  return g.window !== undefined || g.document !== undefined || typeof g.importScripts === "function";
}

/**
 * The user-agent header for a request: none in a browser. A header the page
 * sets is not CORS-safelisted, User-Agent included: Firefox sends it, so it
 * lands in the preflight's Access-Control-Request-Headers, which the API's
 * allow-list (authorization, x-api-key, content-type) refuses, failing every
 * call (Chromium drops it silently). The browser sends its own anyway.
 */
export function userAgentHeader(userAgent: string): Record<string, string> {
  return inBrowser() ? {} : { "user-agent": userAgent };
}

export class Http {
  constructor(private baseUrl: string, private apiKey: string, private userAgent: string = SDK_USER_AGENT) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", ...userAgentHeader(this.userAgent), ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  }
  async get(path: string): Promise<any> { return (await this.req(path)).json(); }
  async post(path: string, body?: unknown): Promise<any> {
    const text = await (await this.req(path, { method: "POST", body: JSON.stringify(body ?? {}) })).text();
    return text ? JSON.parse(text) : {};
  }
  async del(path: string): Promise<void> { await this.req(path, { method: "DELETE" }); }
  /** Returns the raw Response (authenticated, error-checked) for streaming use cases. */
  async stream(path: string, init?: RequestInit): Promise<Response> { return this.req(path, init); }
}
