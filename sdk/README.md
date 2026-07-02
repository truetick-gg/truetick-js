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

// Get metrics
const metrics = await client.servers.metrics("srv_xyz");
console.log(`TPS: ${metrics.tps}, Players: ${metrics.players}`);
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
const metrics = await client.servers.metrics("srv_xyz");
console.log(metrics.tps, metrics.mspt, metrics.players, metrics.live);

// Access historical data
metrics.series.forEach(sample => {
  console.log(`${sample.ts}: TPS=${sample.tps}, players=${sample.players}`);
});
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
- `ServerMetrics`: tps, mspt, players, live, series (historical samples)
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
