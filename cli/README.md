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

# Get server details
truetick servers get <id>

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

# Write a file from local file
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

# Add a mod from Modrinth
truetick mods add <id> --source modrinth --project sodium --version 0.5.11

# Add from CurseForge
truetick mods add <id> --source curseforge --project 394468 --version mc1.20.4-0.11.2

# Remove a mod
truetick mods remove <id> --source modrinth --project sodium
```

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
per-server SFTP and are binary-safe with no size cap. A `--create` server is metered + scale-to-zero:
you are billed only while it is awake.

`dev` deploys once, then watches the artifact glob and redeploys on every change (debounced), while
tailing the server log live. Press Ctrl-C to stop watching. `down --yes` deletes the bound server; it
warns first if the server was not created by `init` (`ephemeral = false`).

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
truetick servers get <id>
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

# Add Sodium for optimization
truetick mods add <id> --source modrinth --project sodium

# Add Lithium (CurseForge)
truetick mods add <id> --source curseforge --project 394468

# Remove Sodium
truetick mods remove <id> --source modrinth --project sodium
```

### Monitor server metrics

```bash
# Get TPS, MSPT, and player count
truetick servers get <id>

# Detailed metrics including historical data
curl -H "x-api-key: $TRUETICK_API_KEY" \
  https://api.truetick.gg/v1/servers/<id>/metrics | jq .
```

## API Reference

For complete endpoint documentation and error codes: [docs/api/api-reference.md](../api/api-reference.md)

For examples across CLI, SDK, curl, and MCP: [docs/api/quickstart.md](../api/quickstart.md)

## Publishing

At publish time, `@truetick/sdk` is published first and this dependency is set to the matching `^x.y.z` range.
