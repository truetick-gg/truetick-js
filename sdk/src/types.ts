export const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

export interface Server {
  id: string;
  hostname: string;
  container: string;
  addr: string;
  state: string;
  accountId?: string;
  ramMb?: number;
  lastActiveAt?: string;
  bakedAt?: string;
  plan?: string;
  type?: string;
  version?: string;
  motd?: string;
  properties?: Record<string, string>;
  idleTimeoutMinutes?: number;
  region?: string;
  installError?: string;
}

export interface Wallet {
  accountId: string;
  balanceMicros: number;
}

/**
 * Where a `tps` reading came from. `TPS_SOURCE_UNSPECIFIED` means there is NO
 * reading — the accompanying `tps` is a zero value, not a measured zero — and
 * the API always sends one of these three, never an absent field.
 */
export type TPSSource = "TPS_SOURCE_UNSPECIFIED" | "TPS_SOURCE_CORE" | "TPS_SOURCE_MEASURED";

export interface ServerMetrics {
  /**
   * Latest poll's ticks per second. Read it together with `tpsSource`: a `0`
   * under `TPS_SOURCE_UNSPECIFIED` is an absence (first poll after a start or
   * wake, or a world parked by `pause-when-empty`), while a `0` under
   * `TPS_SOURCE_MEASURED` is a world that genuinely stopped ticking.
   */
  tps: number;
  /**
   * How `tps` was obtained. `TPS_SOURCE_MEASURED` = we counted the world's own
   * tick counter across the interval (Paper, Purpur, Vanilla and Fabric from
   * Minecraft 1.20.3); `TPS_SOURCE_CORE` = the core reported its own achieved
   * rate (Forge, NeoForge, pre-1.20.3 Paper/Purpur, Pumpkin). Optional in this
   * type only so callers pointed at an older API build keep compiling.
   */
  tpsSource?: TPSSource;
  /** Mean milliseconds per tick, as the core reports it. */
  mspt: number;
  /** 95th-percentile tick time. `0`/absent = this core prints no percentiles. */
  msptP95?: number;
  /** The core's own word about its loop: `"running"`, `"lagging"`, or `""`. */
  tickStatus?: string;
  /** The rate the server is configured to aim for (normally 20). `0` = not reported. */
  targetTps?: number;
  /** Smoothed rate over a trailing 60s window — what the panel tile shows. */
  headlineTps?: number;
  /**
   * How much measured ticking `headlineTps` rests on. Less than 60 right after
   * a start or wake; `0` means there is no headline yet.
   */
  headlineWindowSeconds?: number;
  players: number;
  /**
   * Tick data (MSPT, status, players) is a fresh measurement. This does NOT
   * imply a TPS reading exists — gate the number itself on `tpsSource`.
   */
  live: boolean;
}

/** One minute of tick health from `GET /v1/servers/{id}/tick-history`. */
export interface TickMinute {
  /** RFC3339 start of the minute this bucket covers. */
  minute: string;
  /**
   * Ticks per second across the minute. On cores we measure (Paper, Purpur,
   * Vanilla, Fabric from Minecraft 1.20.3) this is counted off the world tick
   * counter over the minute — a rate, not an average of rates. On cores that
   * report their own TPS (Forge, NeoForge, Pumpkin, pre-1.20.3 Paper/Purpur) there is
   * no counter to subtract, so the bucket carries the mean of what the core
   * said, which is the only number that exists for them. `ServerMetrics.tpsSource`
   * on a live poll tells you which of the two a given server produces.
   */
  tps: number;
  msptMean: number;
  /**
   * Absent when the core prints no percentiles — never fabricated as 0. This
   * one really is nullable on the wire (a proto3 `optional`), unlike
   * `ServerMetrics.msptP95`, where 0 is the "not reported" signal.
   */
  msptP95?: number | null;
  players: number;
  /** True when at least one poll in the minute had the core reporting "lagging". */
  lagging: boolean;
  /** How many polls this bucket rests on — 2 is a weaker claim than 12. */
  samples: number;
}

export interface TickHistory {
  /** Oldest first. A missing minute is a real gap, never a zero row. */
  minutes: TickMinute[];
  /** The window actually applied after server-side clamping to [1, 720]. */
  hours: number;
}

export interface Backup {
  id: string;
  serverId: string;
  createdAt: string;
  sizeBytes: number;
  /**
   * Which path took the backup: "auto" (the daily backup), "manual",
   * "scheduled", "preop" (right before a destructive operation), "reaped",
   * "adopted" (found on disk without a record) or "legacy" (taken before
   * kinds were recorded). Absent from an older API.
   */
  kind?: string;
  /** Qualifies kind; for "preop", the operation it was taken before ("version-change"). */
  reason?: string;
}

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
}

export interface Mod {
  source: string;
  projectId: string;
  versionSpec?: string;
  /** The pinned build's version number (Modrinth) or file name (CurseForge), recorded when the pin was set. */
  versionLabel?: string;
  name?: string;
}

/** One build of a catalog project a server can pin; pass `id` as `versionSpec` to `mods.add`. */
export interface ModVersion {
  id: string;
  number: string;
  /** "release" | "beta" | "alpha", or "" when the upstream states none. */
  versionType: string;
  /** Unix seconds; 0 when unknown. */
  publishedUnix: number;
}

export interface SftpCredential {
  host: string;
  port: number;
  username: string;
  password: string;
}

export const toSftpCredential = (r: any): SftpCredential => ({
  host: r.host,
  port: num(r.port),
  username: r.username,
  password: r.password,
});

export interface WhoAmI {
  accountId: string;
  email?: string;
  emailVerified?: boolean;
}

export interface CreateServerInput {
  name: string;
  ramMb: number;
  type?: string;
  version?: string;
  region?: string;
  plan?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  serverType: string;
  version: string;
  ramMb: number;
  plan: string;
  motd: string;
  modpack?: { platform: string; ref: string; version: string };
  properties?: Record<string, string>;
}

export interface TemplateOverrides {
  ramMb?: number;
  region?: string;
  version?: string;
  plan?: string;
}

export const toServer = (r: any): Server => ({
  id: r.id,
  hostname: r.hostname,
  container: r.container,
  addr: r.addr,
  state: r.state,
  accountId: r.accountId,
  ramMb: r.ramMb == null ? undefined : num(r.ramMb),
  lastActiveAt: r.lastActiveAt,
  bakedAt: r.bakedAt,
  plan: r.plan,
  type: r.type,
  version: r.version,
  motd: r.motd,
  properties: r.properties ?? {},
  idleTimeoutMinutes: r.idleTimeoutMinutes == null ? undefined : num(r.idleTimeoutMinutes),
  region: r.region || undefined,
  installError: r.installError || undefined,
});

export const toWallet = (r: any): Wallet => ({
  accountId: r.accountId,
  balanceMicros: num(r.balanceMicros),
});

export const toBackup = (r: any): Backup => ({
  id: r.id,
  serverId: r.serverId,
  createdAt: r.createdAt,
  sizeBytes: num(r.sizeBytes),
  kind: r.kind,
  reason: r.reason,
});
