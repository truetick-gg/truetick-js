import { errorFor } from "./errors.js";

export class Http {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw errorFor(res.status);
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
