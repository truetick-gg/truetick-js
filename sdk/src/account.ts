import type { Http } from "./http.js";

// Account lazily resolves (once) the account bound to the API key, for account-scoped routes.
export class Account {
  private cached?: string;
  constructor(private http: Http) {}
  async id(): Promise<string> {
    if (this.cached) return this.cached;
    const r = await this.http.get("/v1/whoami");
    this.cached = String(r.accountId);
    return this.cached;
  }
}
