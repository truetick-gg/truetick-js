# @truetick/cli

Command-line interface for the TrueTick Minecraft hosting API.

## Installation

Install globally to use `truetick` command anywhere:

```bash
npm install -g @truetick/cli
```

Or use without installing (requires npx):

```bash
npx @truetick/cli servers list
```

## Quick Start

Create an API key at [truetick.gg/dashboard/api-keys](https://truetick.gg/dashboard/api-keys).

Log in and save your key:

```bash
truetick login --key ttk_your_key_here
```

This saves your key to `~/.truetick/config.json` (file mode `0600`).

List your servers:

```bash
truetick servers list
```

## Commands

### Account

```bash
# Show your account info
truetick whoami

# Show your wallet balance
truetick wallet
```

### Servers

```bash
# List all servers
truetick servers list

# Get server details (state, plan, version — no tick data)
truetick servers get <id>

# Live tick metrics for a running server
truetick servers metrics <id>

# Create a server
truetick servers create --name "My SMP" --ram 4096 --type PAPER --version 1.20.4

# Start a server
truetick servers start <id>

# Stop a server
truetick servers stop <id>

# Restart a server
truetick servers restart <id>

# Delete a server (requires --yes confirmation)
truetick servers delete <id> --yes
```

### Console (RCON)

```bash
# Run a console command on a running server
truetick console <id> "say Hello from CLI!"
```

### Files

```bash
# List files in a directory
truetick files ls <id> /data

# Read a file
truetick files cat <id> /data/server.properties

# Upload a local file over SFTP (each call issues a new SFTP password, see Mods below)
truetick files put <id> /data/motd.txt ./local-motd.txt

# Delete a file (requires --yes confirmation)
truetick files rm <id> /data/old.txt --yes
```

### Backups

```bash
# Create a backup
truetick backups create <id>

# List backups
truetick backups list <id>

# Restore a backup (server must be stopped; requires --yes confirmation)
truetick backups restore <id> <backupId> --yes
```

### Mods

```bash
# List installed mods
truetick mods list <id>

# Add from Modrinth: Chunky has builds for Paper and for the mod loaders.
# --version (optional) is a version number or ID from the project's Modrinth versions page.
truetick mods add <id> --source modrinth --project chunky

# Add from CurseForge by numeric project ID: 360438 is Lithium, a Fabric and NeoForge mod.
# --version (optional) is a numeric file ID.
truetick mods add <id> --source curseforge --project 360438

# Remove a mod
truetick mods remove <id> --source modrinth --project chunky
```

An add can also write the project's required Modrinth dependencies as entries of their own (Chunky on
a Fabric server brings Fabric API). Modrinth mods marked client-side only are refused on Fabric, Forge
and NeoForge, and catalog adds are refused on a Velocity proxy — upload the plugin's `.jar` there
with `truetick files put`. Each `files put` (and each `deploy`) issues a new SFTP password for the
server, and the previous one stops working. If you keep a saved SFTP login (FileZilla, WinSCP), use
**Upload .jar** in the panel instead (up to 100 MB): it leaves the SFTP password alone.

## Plugin/mod dev loop

```bash
truetick login --key ttk_xxx          # paste a key from the dashboard
cd my-plugin
truetick init --create --name "Dev" --ram 4096 --type PAPER --yes
truetick deploy                        # build -> upload -> restart -> confirm
truetick dev                           # same, automatically on every rebuild
truetick down --yes                    # remove the ephemeral dev server
```

`init` writes `truetick.toml` (server id, target dir, build command, artifact glob). Uploads use
per-server SFTP and are binary-safe with no size cap. Each upload issues a new SFTP password for the
server, so an SFTP login saved elsewhere stops working. A `--create` server is metered +
scale-to-zero: you are billed only while it is awake.

`dev` deploys once, then watches the artifact glob and redeploys on every change (debounced), while
tailing the server log live. Press Ctrl-C to stop watching. `down --yes` deletes the dev server that
`init --create` made (`ephemeral = true`). It refuses a server bound with `init --server`
(`ephemeral = false`), even with `--yes`: deleting that one takes its world, files and backups with it,
so it needs the explicit `truetick servers delete <id> --yes`.

## Options

### Global Options

```bash
truetick --json <command>    # Output raw JSON instead of formatted text
```

### Login

```bash
truetick login --key ttk_your_key --url https://custom.api.url
```

Saves to `~/.truetick/config.json`. Pass `--url` to use a custom API endpoint.

### Destructive Commands

Commands that modify data (`delete`, `restore`, `remove`, etc.) require explicit confirmation:

```bash
truetick servers delete <id> --yes     # Must pass --yes
truetick files rm <id> <path> --yes
truetick backups restore <id> <id> --yes
```

Without `--yes`, the command refuses to run:

```
Refusing destructive action without --yes: Delete server srv_xyz?
```

## Output Format

By default, commands output formatted tables and strings:

```bash
$ truetick servers list
hostname       state     ramMb   region  plan
my-smp         running   4096    NA      metered
test-server    stopped   2048    EU      flat
```

Use `--json` for raw JSON:

```bash
$ truetick servers list --json
[
  {"id":"srv_…","hostname":"my-smp","state":"running","ramMb":4096,"region":"NA"},
  …
]
```

## Environment Variables

### API Authentication

- `TRUETICK_API_KEY` — API key (overrides saved key in `~/.truetick/config.json`)
- `TRUETICK_API_URL` — API base URL (defaults to `https://api.truetick.gg`)

Example:

```bash
export TRUETICK_API_KEY="ttk_your_key"
truetick servers list
```

## Configuration File

The login command saves credentials to `~/.truetick/config.json`:

```json
{
  "apiKey": "ttk_your_key",
  "baseUrl": "https://api.truetick.gg"
}
```

File permissions: `0600` (owner-read/write only) for security.

To log in again with a different key:

```bash
truetick login --key ttk_different_key
```

To clear saved credentials:

```bash
rm ~/.truetick/config.json
```

## Examples

### Create and start a server

```bash
# Create
truetick servers create --name "SMP" --ram 8192 --type PAPER --version 1.20.4
# Note the server ID from output

# Start
truetick servers start <id>

# Wait, then check metrics
sleep 30
truetick servers metrics <id>
```

### Backup and restore workflow

```bash
# Create a backup
truetick backups create <id>

# List backups and note the ID
truetick backups list <id>

# Stop the server
truetick servers stop <id>

# Restore from backup
truetick backups restore <id> <backup_id> --yes

# Restart the server
truetick servers start <id>
```

### Manage mods

```bash
# List current mods
truetick mods list <id>

# Add Chunky (Modrinth) to a Paper server
truetick mods add <id> --source modrinth --project chunky

# Add Lithium (CurseForge project 360438) to a Fabric or NeoForge server
truetick mods add <id> --source curseforge --project 360438

# Remove Chunky
truetick mods remove <id> --source modrinth --project chunky
```

### Monitor server metrics

```bash
# Live TPS, MSPT and player count
truetick servers metrics <id>

# One-minute buckets of tick health (default 24h, max 720)
truetick servers tick-history <id> --hours 24
```

`servers get` returns the server record — state, plan, version — and carries no tick data.

Read `tps` together with `tpsSource`: `TPS_SOURCE_UNSPECIFIED` means there is **no reading**
(the first poll after a start or wake, or a world parked by `pause-when-empty`), and `tps` is a
zero value there, not zero performance. In `tick-history`, minutes the server slept through have
no row at all — a gap is a real gap, never a zero.

## API Reference

For complete endpoint documentation and error codes: [docs/api/api-reference.md](../api/api-reference.md)

For examples across CLI, SDK, curl, and MCP: [docs/api/quickstart.md](../api/quickstart.md)

## Publishing

At publish time, `@truetick/sdk` is published first and this dependency is set to the matching `^x.y.z` range.
