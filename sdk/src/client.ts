import { Http, userAgentWith } from "./http.js";
import { Account } from "./account.js";
import { toServer, toWallet, toBackup, num, Server, ServerMetrics, TickHistory, Wallet, Backup, FileEntry, Mod, ModVersion, WhoAmI, CreateServerInput, Template, TemplateOverrides, SftpCredential, toSftpCredential } from "./types.js";
import { parseLabel, serverHostname, gameDomainFromBaseUrl } from "./naming.js";

const enc = encodeURIComponent;

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Your own product token, sent ahead of the SDK's: "my-bot/1.2" → "my-bot/1.2 truetick-sdk/<version>". Not sent from a browser, which sets its own. */
  userAgent?: string;
}

export class TrueTickClient {
  private http: Http;
  private account: Account;
  private baseUrl: string;

  constructor(opts: ClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.TRUETICK_API_KEY;
    if (!apiKey) throw new Error("TrueTick API key required (opts.apiKey or TRUETICK_API_KEY).");
    this.baseUrl = opts.baseUrl ?? process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";
    this.http = new Http(this.baseUrl, apiKey, userAgentWith(opts.userAgent));
    this.account = new Account(this.http);
  }

  whoami = async (): Promise<WhoAmI> => {
    const r = await this.http.get("/v1/whoami");
    return { accountId: r.accountId, email: r.email, emailVerified: !!r.emailVerified };
  };

  templates = {
    list: async (): Promise<Template[]> => ((await this.http.get("/v1/templates")).templates ?? []).map((t: any) => ({ ...t, ramMb: num(t.ramMb) })),
  };

  servers = {
    list: async (): Promise<Server[]> => ((await this.http.get(`/v1/servers?account_id=${enc(await this.account.id())}`)).servers ?? []).map(toServer),
    get: async (id: string): Promise<Server> => toServer(await this.http.get(`/v1/servers/${enc(id)}`)),
    create: async (input: CreateServerInput): Promise<Server> => {
      const id = parseLabel(input.name);
      if (!id) throw new Error("name must contain letters or numbers");
      const hostname = serverHostname(id, gameDomainFromBaseUrl(this.baseUrl));
      return toServer(await this.http.post("/v1/servers", {
        id, hostname, container: `mc_${id}`, addr: "",
        accountId: await this.account.id(),
        ramMb: input.ramMb, type: input.type, version: input.version,
        region: input.region, plan: input.plan,
      }));
    },
    start: async (id: string): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:start`, {})),
    stop: async (id: string): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:stop`, {})),
    restart: async (id: string): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:restart`, {})),
    delete: async (id: string): Promise<void> => this.http.del(`/v1/servers/${enc(id)}`),
    metrics: async (id: string): Promise<ServerMetrics> => this.http.get(`/v1/servers/${enc(id)}/metrics`),
    // Minute buckets of tick health. `hours` is clamped server-side to [1, 720];
    // the response's own `hours` reports the window actually applied. Minutes
    // with nothing to say (asleep, unmeasured) are absent rows, never zero rows
    // — plot the gap, don't interpolate across it.
    tickHistory: async (id: string, opts?: { hours?: number }): Promise<TickHistory> => {
      const q = opts?.hours !== undefined ? `?hours=${encodeURIComponent(String(opts.hours))}` : "";
      const r = await this.http.get(`/v1/servers/${enc(id)}/tick-history${q}`);
      return { minutes: r.minutes ?? [], hours: num(r.hours) };
    },
    updateVersion: async (id: string, v: { type: string; version: string }): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:set-version`, v)),
    setProperties: async (id: string, p: { properties: Record<string, string>; idleTimeoutMinutes?: number }): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:set-properties`, p)),
    setMotd: async (id: string, motd: string): Promise<Server> => toServer(await this.http.post(`/v1/servers/${enc(id)}:set-motd`, { motd })),
    createFromTemplate: async (templateId: string, name: string, overrides?: TemplateOverrides): Promise<Server> =>
      toServer(await this.http.post(`/v1/templates/${enc(templateId)}:create`, overrides ? { name, overrides } : { name })),

    recentLogs: async (id: string, opts?: { tail?: number; cursor?: string }): Promise<{ lines: string[]; cursor: string; containerMissing: boolean }> => {
      const p = new URLSearchParams();
      if (opts?.tail !== undefined) p.set("tail", String(opts.tail));
      if (opts?.cursor) p.set("cursor", opts.cursor);
      const qs = p.toString();
      const r = await this.http.get(`/v1/servers/${enc(id)}/logs${qs ? `?${qs}` : ""}`);
      return { lines: r.lines ?? [], cursor: r.cursor ?? "", containerMissing: !!r.containerMissing };
    },

    streamLogs: (id: string, opts?: { tail?: number; signal?: AbortSignal }): AsyncIterable<string> => {
      const p = new URLSearchParams();
      if (opts?.tail !== undefined) p.set("tail", String(opts.tail));
      const qs = p.toString();
      const path = `/v1/servers/${enc(id)}/logs/stream${qs ? `?${qs}` : ""}`;
      const http = this.http;
      const signal = opts?.signal;
      async function* gen(): AsyncGenerator<string> {
        const res = await http.stream(path, { signal });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            if (signal?.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // Split on SSE event boundaries (double newline).
            const parts = buf.split("\n\n");
            buf = parts.pop()!; // Keep trailing partial for next chunk.
            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith(":")) continue; // heartbeat / comment line
              if (trimmed.startsWith("data: ")) yield trimmed.slice(6);
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      return gen();
    },

    enableSftp: async (id: string): Promise<SftpCredential> =>
      toSftpCredential(await this.http.post(`/v1/servers/${enc(id)}:enable-sftp`, {})),
  };

  console = {
    run: async (id: string, command: string): Promise<{ output: string }> => this.http.post(`/v1/servers/${enc(id)}:command`, { command }),
  };

  files = {
    list: async (id: string, path: string): Promise<FileEntry[]> => ((await this.http.get(`/v1/servers/${enc(id)}/files?path=${enc(path)}`)).entries ?? []).map((e: any) => ({ name: e.name, isDir: !!e.isDir, size: num(e.size) })),
    read: async (id: string, path: string): Promise<string> => {
      const r = await this.http.get(`/v1/servers/${enc(id)}/file?path=${enc(path)}`);
      return Buffer.from(r.content ?? "", "base64").toString("utf8");
    },
    write: async (id: string, path: string, content: string): Promise<void> => { await this.http.post(`/v1/servers/${enc(id)}/file`, { path, content: Buffer.from(content, "utf8").toString("base64") }); },
    delete: async (id: string, path: string): Promise<void> => { await this.http.post(`/v1/servers/${enc(id)}/file:delete`, { path }); },
  };

  backups = {
    create: async (id: string): Promise<Backup> => toBackup(await this.http.post(`/v1/servers/${enc(id)}/backups`, {})),
    list: async (id: string): Promise<Backup[]> => ((await this.http.get(`/v1/servers/${enc(id)}/backups`)).backups ?? []).map(toBackup),
    restore: async (id: string, backupId: string): Promise<void> => { await this.http.post(`/v1/servers/${enc(id)}/backups/${enc(backupId)}:restore`, {}); },
  };

  mods = {
    list: async (id: string): Promise<Mod[]> => ((await this.http.get(`/v1/servers/${enc(id)}/mods`)).mods ?? []),
    add: async (id: string, m: { source: string; projectId: string; versionSpec?: string }): Promise<void> => { await this.http.post(`/v1/servers/${enc(id)}/mods`, m); },
    remove: async (id: string, m: { source: string; projectId: string }): Promise<void> => { await this.http.post(`/v1/servers/${enc(id)}/mods:remove`, m); },
    /** Builds of a project this server can pin: its loader and Minecraft version only, pre-releases included, newest first. `partial` = CurseForge holds more files than were read. */
    versions: async (id: string, m: { source: string; projectId: string }): Promise<{ versions: ModVersion[]; partial: boolean }> => {
      const r = await this.http.get(`/v1/servers/${enc(id)}/mods/versions?source=${enc(m.source)}&project_id=${enc(m.projectId)}`);
      return {
        versions: (r.versions ?? []).map((v: any) => ({ id: v.id, number: v.number ?? "", versionType: v.versionType ?? "", publishedUnix: num(v.publishedUnix) })),
        partial: r.partial === true,
      };
    },
  };

  wallet = {
    get: async (): Promise<Wallet> => toWallet(await this.http.get(`/v1/accounts/${enc(await this.account.id())}/wallet`)),
  };

  billing = {
    createCheckout: async (amountUsd: number): Promise<{ checkoutUrl: string }> => {
      const r = await this.http.post(`/v1/accounts/${enc(await this.account.id())}/checkout-link`, { amountUsd });
      return { checkoutUrl: r.checkoutUrl ?? r.checkout_url };
    },
  };
}
