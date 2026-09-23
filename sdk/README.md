# @truetick/sdk

TypeScript/JavaScript SDK for the TrueTick Minecraft hosting API.

## Installation

```bash
npm install @truetick/sdk
```

## Quick Start

```typescript
import { TrueTickClient } from "@truetick/sdk";

const client = new TrueTickClient({
  apiKey: "ttk_your_key_here"
});

// List servers
const servers = await client.servers.list();
console.log(servers);

// Start a server
const server = await client.servers.start("srv_xyz");
console.log(`Started ${server.hostname}`);

// Get metrics. Read tps together with tpsSource: TPS_SOURCE_UNSPECIFIED means
// there is NO reading (first poll after a start or wake, or a world parked by
// pause-when-empty) and tps is a zero value there, not zero performance.
const m = await client.servers.metrics("srv_xyz");
const rate = m.tpsSource === "TPS_SOURCE_UNSPECIFIED" ? "no TPS reading yet" : `TPS: ${m.tps}`;
console.log(`${rate}, Players: ${m.players}`);
```

## Authentication

Create an API key at [truetick.gg/dashboard/api-keys](https://truetick.gg/dashboard/api-keys) and pass it to the client:

```typescript
const client = new TrueTickClient({
  apiKey: "ttk_your_key",
  baseUrl: "https://api.truetick.gg" // optional; defaults to production
});
```

Or use the `TRUETICK_API_KEY` environment variable:

```typescript
const client = new TrueTickClient();
// Reads apiKey from process.env.TRUETICK_API_KEY
```

## Sign In with TrueTick (Apps)

For third-party applications (e.g., Electron launchers), use device flow (RFC 8628) to sign players in and list their servers:

```typescript
import { signInWithDevice, AppClient } from "@truetick/sdk";

// Step 1: Initiate device flow
const { token, scope } = await signInWithDevice({
  clientId: "my-app",
  scope: "servers:list",
  onCode: (prompt) => {
    // Display to user: "Enter code ABCD-1234 at https://truetick.gg/device?code=ABCD-1234"
    console.log(`Visit: ${prompt.verificationUriComplete}`);
  }
});

// Step 2: Use the token to list servers
const appClient = new AppClient({ token });
const { my, shared } = await appClient.listMyServers();
console.log(`Owned servers: ${my.length}, Shared: ${shared.length}`);

// Step 3: Get account info
const whoami = await appClient.whoAmI();
console.log(`Signed in as: ${whoami.email}`);
```

**Device flow options:**
- `clientId` (required) — your app's ID (e.g., `"my-launcher"`)
- `scope` (optional) — defaults to `"servers:list"` 
- `onCode` (required) — callback to display the user code and verification URL
- `baseUrl` (optional) — API endpoint; defaults to `https://api.truetick.gg`
- `signal` (optional) — AbortSignal to cancel sign-in
- `sleep` (optional) — async sleep function for testing; defaults to setTimeout

**AppClient methods:**
- `.listMyServers()` — returns `{ my: MyServer[], shared: MyServer[] }` with owned and shared servers.
  Each `MyServer` has `id`, `address`, `state`, `type`, `version`, `region`, `role` and, only when
  live stats are fresh, `playersOnline` (absent = unknown, not zero). An absent or empty `address`
  means a private network backend with no public address of its own: players join through the
  network's proxy. Nothing about the owning account is returned.
- `.whoAmI()` — returns `{ email }` (an app token carries no account id)

**Error handling:**

Both functions throw `TrueTickError` on failure. Distinguish between "sign in again" (terminal) and "try later" (transient):

- **signInWithDevice** — codes:
  - Terminal: `access_denied` (user denied), `expired_token` (code timed out), `invalid_client` / `invalid_scope` / `invalid_request` (configuration), `device_start_failed` / `sign_in_failed` (server error), `bad_response` (non-JSON response), `aborted` (user cancelled)
  - Try later: `server_error` (status 500 while starting the grant — a transient failure on TrueTick's side) and status 429 (the per-IP limit on starting grants: 20 per hour) — start sign-in again later
  - Internal only: `authorization_pending` and `slow_down` are handled automatically, and a 5xx or 429 while polling is retried until the code expires — never thrown

- **AppClient** — codes:
  - Terminal: `unauthenticated` (status 401 — token revoked/invalid; delete it and sign in again), `permission_denied` (403)
  - Transient: `rate_limited` (429), `unavailable` (>=500), `bad_response` (non-JSON response)
  - Other: `http_<status>` for unmapped 4xx errors

Retry logic: transient codes → keep token and retry later; terminal codes → discard token and re-sign-in.

## Resources

### Servers

```typescript
// List all servers
const servers = await client.servers.list();

// Get a specific server
const server = await client.servers.get("srv_xyz");
console.log(server.hostname, server.state, server.ramMb);

// Create a server
const newServer = await client.servers.create({
  name: "My SMP",
  ramMb: 4096,
  type: "PAPER",
  version: "1.20.4"
});

// Start/stop/restart
await client.servers.start("srv_xyz");
await client.servers.stop("srv_xyz");
await client.servers.restart("srv_xyz");

// Update version
await client.servers.updateVersion("srv_xyz", {
  type: "PURPUR",
  version: "1.21"
});

// Set MOTD
await client.servers.setMotd("srv_xyz", "Welcome to my server!");

// Set server.properties
await client.servers.setProperties("srv_xyz", {
  properties: {
    "difficulty": "hard",
    "pvp": "true"
  },
  idleTimeoutMinutes: 30
});

// Delete a server
await client.servers.delete("srv_xyz");
```

### Metrics

```typescript
const m = await client.servers.metrics("srv_xyz");

// `live` gates tick data (mspt, players). It does NOT mean a TPS reading
// exists — gate the rate itself on tpsSource, or a healthy server's first
// poll after a wake reads as 0 TPS.
if (m.tpsSource === "TPS_SOURCE_MEASURED" || m.tpsSource === "TPS_SOURCE_CORE") {
  console.log(`${m.tps} TPS, mspt ${m.mspt}`);
}

// targetTps and msptP95 are a NARROWER set than tps: only cores answering the
// vanilla `tick query` report them (Paper, Purpur, Vanilla, Fabric from
// Minecraft 1.20.3). On Forge, NeoForge, Pumpkin and pre-1.20.3 Paper/Purpur both are
// structurally 0 — which is the documented "not reported" signal, not a target
// of zero and not a perfectly flat tail. Printing them under the same branch as
// tps invents both.
if (m.targetTps) console.log(`target ${m.targetTps} TPS`);
if (m.msptP95) console.log(`p95 ${m.msptP95}ms — the tail is where stutter lives`);

// Same rule: "" means the core has no state word, not that it is healthy.
if (m.tickStatus === "lagging") {
  console.log("the core itself reports it cannot keep up");
}

// Historical data: one row per minute, oldest first. Minutes the server slept
// through have no row at all — a gap is a real gap, never a zero.
const history = await client.servers.tickHistory("srv_xyz", { hours: 24 });
for (const min of history.minutes) {
  console.log(`${min.minute}: ${min.tps} TPS over ${min.samples} polls${min.lagging ? " (lagging)" : ""}`);
}
```

### Console (RCON)

```typescript
const result = await client.console.run("srv_xyz", "say Hello from SDK!");
console.log(result.output);
```

### Files

```typescript
// List files
const entries = await client.files.list("srv_xyz", "/data");
entries.forEach(e => console.log(e.name, e.isDir, e.size));

// Read a file
const content = await client.files.read("srv_xyz", "/data/server.properties");
console.log(content);

// Write a file
await client.files.write("srv_xyz", "/data/motd.txt", "New motd");

// Delete a file
await client.files.delete("srv_xyz", "/data/old.txt");
```

### Backups

```typescript
// Create a backup
const backup = await client.backups.create("srv_xyz");
console.log(`Backup created: ${backup.id} (${backup.sizeBytes} bytes)`);

// List backups
const backups = await client.backups.list("srv_xyz");

// Restore a backup (server must be stopped)
await client.backups.restore("srv_xyz", backup.id);
```

### Mods & Plugins

```typescript
// List installed mods
const mods = await client.mods.list("srv_xyz");
mods.forEach(m => console.log(m.projectId, m.versionSpec));

// Add a mod from Modrinth
await client.mods.add("srv_xyz", {
  source: "modrinth",
  projectId: "sodium",
  versionSpec: "0.5.11" // optional
});

// Add from CurseForge
await client.mods.add("srv_xyz", {
  source: "curseforge",
  projectId: "394468", // Lithium project ID
  versionSpec: "mc1.20.4-0.11.2"
});

// Remove a mod
await client.mods.remove("srv_xyz", {
  source: "modrinth",
  projectId: "sodium"
});
```

### Wallet

```typescript
const wallet = await client.wallet.get();
console.log(`Balance: $${wallet.balanceMicros / 1_000_000}`);
```

### Account

```typescript
const whoami = await client.whoami();
console.log(whoami.accountId, whoami.email);
```

## Error Handling

All errors are thrown as `TrueTickError`:

```typescript
import { TrueTickError } from "@truetick/sdk";

try {
  await client.servers.start("srv_xyz");
} catch (e) {
  if (e instanceof TrueTickError) {
    console.error(`API Error (${e.code}): ${e.message}`);
    if (e.status === 401) console.error("Invalid API key");
    if (e.status === 403) console.error("Missing scope for this operation");
    if (e.status === 404) console.error("Server not found");
    if (e.status === 429) console.error("Rate limited; retry later");
  }
}
```

Error fields:
- `status` — HTTP status code
- `code` — machine-readable error code (`unauthorized`, `forbidden`, `not_found`, `rate_limited`, `server_error`)
- `message` — human-readable error description

## Types

All major types are exported:

```typescript
import {
  Server,
  ServerMetrics,
  TPSSource,
  TickMinute,
  TickHistory,
  Wallet,
  Backup,
  FileEntry,
  Mod,
  WhoAmI,
  CreateServerInput,
  TrueTickError
} from "@truetick/sdk";
```

Key type hints:

- `Server`: id, hostname, state, ramMb, type, version, region, plan, motd, properties, etc.
- `ServerMetrics`: tps, tpsSource, mspt, msptP95, tickStatus, targetTps, headlineTps,
  headlineWindowSeconds, players, live. `tps` is only a reading when `tpsSource` is
  `TPS_SOURCE_MEASURED` (we counted the world's own tick counter) or `TPS_SOURCE_CORE`
  (the core reported its own rate); under `TPS_SOURCE_UNSPECIFIED` it is a zero value,
  not a measurement
- `TickHistory`: minutes (`TickMinute[]`, oldest first), hours (the window actually applied
  after server-side clamping to 1-720)
- `TickMinute`: minute, tps, msptMean, msptP95 (null when the core prints no percentiles),
  players, lagging, samples
- `Wallet`: accountId, balanceMicros (in microdollars; divide by 1_000_000 for display)
- `Backup`: id, serverId, createdAt, sizeBytes
- `FileEntry`: name, isDir, size
- `Mod`: source, projectId, name, versionSpec

## Environment Variables

- `TRUETICK_API_KEY` — API key; used if not passed to constructor
- `TRUETICK_API_URL` — Base API URL; defaults to `https://api.truetick.gg`

## API Reference

For complete endpoint documentation, scopes, and error codes: [docs/api/api-reference.md](../api/api-reference.md)

For examples across SDK, CLI, curl, and MCP: [docs/api/quickstart.md](../api/quickstart.md)
