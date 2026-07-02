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

export interface ServerMetrics {
  tps: number;
  mspt: number;
  players: number;
  live: boolean;
}

export interface Backup {
  id: string;
  serverId: string;
  createdAt: string;
  sizeBytes: number;
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
  name?: string;
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
});
