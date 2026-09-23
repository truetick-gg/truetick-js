#!/usr/bin/env node
import { basename, posix } from "node:path";
import { createInterface } from "node:readline";
import { Command } from "commander";
import { TrueTickClient } from "@truetick/sdk";
import { resolveKey, saveConfig, clearConfig } from "./config.js";
import { printResult, printError } from "./output.js";
import { runInit, defaultInitDeps } from "./commands/init.js";
import { runDeploy, defaultDeployDeps } from "./commands/deploy.js";
import { runDown } from "./commands/down.js";
import { runDev, defaultDevDeps, DevStop } from "./commands/dev.js";
import { runSignup, runLoginPassword, runDeviceLogin, defaultAuthIO, defaultDeviceDeps } from "./commands/auth.js";
import { runTopup, defaultTopupDeps } from "./commands/topup.js";
import { uploadFile } from "./sftp.js";
import { loadProject } from "./project.js";

function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

type MakeClient = () => TrueTickClient;

const defaultMakeClient: MakeClient = () => {
  const { apiKey, baseUrl } = resolveKey();
  if (!apiKey) {
    console.error("No API key. Run `truetick login` or set TRUETICK_API_KEY.");
    process.exit(1);
  }
  return new TrueTickClient({ apiKey, baseUrl });
};

// run wraps an SDK call: resolve client, execute, print, handle errors + exit code.
async function run(json: boolean, make: MakeClient, fn: (c: TrueTickClient) => Promise<unknown>) {
  try { printResult(await fn(make()), json); }
  catch (e) { printError(e); process.exitCode = 1; }
}

// confirmThen runs fn only when --yes was passed; destructive commands always require it.
async function confirmThen(skip: boolean, prompt: string, fn: () => Promise<void>) {
  if (!skip) {
    console.error(`Refusing destructive action without --yes: ${prompt}`);
    process.exitCode = 1;
    return;
  }
  await fn();
}

export function buildProgram(make: MakeClient = defaultMakeClient): Command {
  const program = new Command("truetick").option("--json", "output raw JSON");
  const json = () => !!program.opts().json;

  // servers subcommands
  const servers = program.command("servers");

  servers.command("list")
    .action(() => run(json(), make, (c) => c.servers.list()));

  servers.command("get <id>")
    .action((id) => run(json(), make, (c) => c.servers.get(id)));

  // `servers get` returns the Server record — state, plan, version — and no
  // tick data: proto's `message Server` has no tps/mspt/players field at all.
  // The README claimed otherwise for as long as it has been on npm. These two
  // commands are what make that section true rather than deleted.
  servers.command("metrics <id>")
    .description("Live TPS/MSPT/players. Read tps together with tpsSource: TPS_SOURCE_UNSPECIFIED means no reading, not zero performance.")
    .action((id) => run(json(), make, (c) => c.servers.metrics(id)));

  servers.command("tick-history <id>")
    .description("One-minute buckets of tick health (default 24h, max 720). Minutes the server slept through are absent rows, not zeroes.")
    .option("--hours <n>", "window in hours (clamped server-side to 1-720)")
    .action((id, o) => run(json(), make, (c) =>
      c.servers.tickHistory(id, o.hours ? { hours: Number(o.hours) } : undefined)));

  servers.command("start <id>")
    .action((id) => run(json(), make, (c) => c.servers.start(id)));

  servers.command("stop <id>")
    .action((id) => run(json(), make, (c) => c.servers.stop(id)));

  servers.command("restart <id>")
    .action((id) => run(json(), make, (c) => c.servers.restart(id)));

  servers.command("create")
    .requiredOption("--name <name>", "server display name")
    .option("--ram <mb>", "RAM in MB")
    .option("--template <id>", "template ID to create from")
    .option("--type <type>", "server type (e.g. PAPER, VANILLA)")
    .option("--version <version>", "Minecraft version (e.g. 1.20.4)")
    .option("--region <region>", "region (e.g. na, eu)")
    .option("--plan <plan>", "billing plan (metered|flat)")
    .action((o) => run(json(), make, (c) => {
      if (o.template) {
        const overrides: Record<string, unknown> = {};
        if (o.ram !== undefined) overrides.ramMb = Number(o.ram);
        if (o.region !== undefined) overrides.region = o.region;
        if (o.version !== undefined) overrides.version = o.version;
        if (o.plan !== undefined) overrides.plan = o.plan;
        return c.servers.createFromTemplate(o.template, o.name, overrides);
      }
      if (!o.ram) throw new Error("--ram is required when not using --template");
      return c.servers.create({ name: o.name, ramMb: Number(o.ram), type: o.type, version: o.version, region: o.region, plan: o.plan });
    }));

  servers.command("delete <id>")
    .option("--yes", "skip confirmation")
    .action((id, o) =>
      confirmThen(o.yes, `Delete server ${id}?`, () => run(json(), make, (c) => c.servers.delete(id)))
    );

  // logs command
  program.command("logs <id>")
    .option("--tail <n>", "number of recent lines to show")
    .option("--follow", "stream live logs until interrupted")
    .action(async (id, o) => {
      const client = make();
      const tail = o.tail !== undefined ? parseInt(o.tail, 10) : undefined;

      if (!o.follow) {
        // snapshot mode: fetch once and print each line
        try {
          const { lines } = await client.servers.recentLogs(id, { tail });
          lines.forEach((l: string) => console.log(l));
        } catch (e) {
          printError(e);
          process.exitCode = 1;
        }
      } else {
        // streaming mode: consume async iterable until done or SIGINT
        const controller = new AbortController();
        const onSigint = () => {
          process.removeListener("SIGINT", onSigint);
          controller.abort();
        };
        process.on("SIGINT", onSigint);
        try {
          for await (const line of client.servers.streamLogs(id, { tail, signal: controller.signal })) {
            console.log(line);
          }
        } catch (e) {
          // AbortError is a clean exit (user pressed Ctrl-C); surface everything else
          if ((e as Error).name !== "AbortError") {
            printError(e);
            process.exitCode = 1;
          }
        } finally {
          process.removeListener("SIGINT", onSigint);
        }
      }
    });

  // console command
  program.command("console <id> <command>")
    .action((id, command) => run(json(), make, (c) => c.console.run(id, command)));

  // whoami
  program.command("whoami")
    .action(() => run(json(), make, (c) => c.whoami()));

  // wallet
  program.command("wallet")
    .action(() => run(json(), make, (c) => c.wallet.get()));

  // files subcommands
  const files = program.command("files");

  files.command("ls <id> <path>")
    .action((id, path) => run(json(), make, (c) => c.files.list(id, path)));

  files.command("cat <id> <path>")
    .action((id, path) => run(json(), make, (c) => c.files.read(id, path)));

  files.command("put <id> <path> <localFile>")
    .description("Upload a local file (binary-safe) to the server via SFTP")
    .action(async (id, path, localFile) => {
      try {
        const client = make();
        const cred = await client.servers.enableSftp(id);
        const remote = path.endsWith("/") || path === "" ? posix.join(path || ".", basename(localFile)) : path;
        await uploadFile(cred, localFile, remote);
        console.log(`Uploaded ${basename(localFile)} -> ${remote}`);
      } catch (e) { printError(e); process.exitCode = 1; }
    });

  files.command("rm <id> <path>")
    .option("--yes", "skip confirmation")
    .action((id, path, o) =>
      confirmThen(o.yes, `Delete ${path}?`, () => run(json(), make, (c) => c.files.delete(id, path)))
    );

  // backups subcommands
  const backups = program.command("backups");

  backups.command("create <id>")
    .action((id) => run(json(), make, (c) => c.backups.create(id)));

  backups.command("list <id>")
    .action((id) => run(json(), make, (c) => c.backups.list(id)));

  backups.command("restore <id> <backupId>")
    .option("--yes", "skip confirmation")
    .action((id, backupId, o) =>
      confirmThen(o.yes, `Restore backup ${backupId} on server ${id}?`, () =>
        run(json(), make, (c) => c.backups.restore(id, backupId))
      )
    );

  // mods subcommands
  const mods = program.command("mods");

  mods.command("list <id>")
    .action((id) => run(json(), make, (c) => c.mods.list(id)));

  mods.command("add <id>")
    .requiredOption("--source <source>", "mod source (modrinth|curseforge)")
    .requiredOption("--project <projectId>", "project ID or slug")
    .option("--version <versionSpec>", "version spec or ID")
    .action((id, o) =>
      run(json(), make, (c) =>
        c.mods.add(id, { source: o.source, projectId: o.project, versionSpec: o.version })
      )
    );

  mods.command("remove <id>")
    .requiredOption("--source <source>", "mod source (modrinth|curseforge)")
    .requiredOption("--project <projectId>", "project ID or slug")
    .action((id, o) =>
      run(json(), make, (c) =>
        c.mods.remove(id, { source: o.source, projectId: o.project })
      )
    );

  // templates subcommands
  const tmpl = program.command("templates");

  tmpl.command("list")
    .action(() => run(json(), make, (c) => c.templates.list()));

  // init
  program.command("init")
    .description("Scaffold truetick.toml; bind to a server or create a dev one")
    .option("--server <id>", "bind to an existing server")
    .option("--create", "create a new metered scale-to-zero dev server")
    .option("--name <name>", "server name (with --create)")
    .option("--ram <mb>", "RAM in MB (with --create; default 4096)")
    .option("--type <type>", "server type, e.g. PAPER, FABRIC (with --create)")
    .option("--version <version>", "Minecraft version (with --create)")
    .option("--region <region>", "region, e.g. na, eu (with --create)")
    .option("--yes", "confirm creating a metered server")
    .action(async (o) => {
      try {
        await runInit(make(), process.cwd(), {
          server: o.server, create: !!o.create, name: o.name,
          ram: o.ram !== undefined ? Number(o.ram) : undefined,
          type: o.type, version: o.version, region: o.region, yes: !!o.yes,
        }, defaultInitDeps);
      } catch (e) { printError(e); process.exitCode = 1; }
    });

  // deploy
  program.command("deploy")
    .description("Build, upload the jar, restart, and confirm it loaded")
    .option("--no-build", "skip the build step")
    .option("--reload", "best-effort reload instead of restart (Bukkit only)")
    .action(async (o) => {
      const project = loadProject(process.cwd());
      if (!project) { console.error("No truetick.toml — run `truetick init` first."); process.exitCode = 1; return; }
      try {
        const v = await runDeploy(make(), project, process.cwd(), { noBuild: o.build === false, reload: !!o.reload }, defaultDeployDeps);
        if (!v.ok) process.exitCode = 1;
      } catch (e) { printError(e); process.exitCode = 1; }
    });

  // dev
  program.command("dev")
    .description("Watch the artifact and redeploy on every change")
    .option("--no-build", "skip the build step on each deploy")
    .action(async (o) => {
      const project = loadProject(process.cwd());
      if (!project) { console.error("No truetick.toml — run `truetick init` first."); process.exitCode = 1; return; }
      const controller = new AbortController();
      const stop: DevStop = { signal: controller.signal, abort: () => controller.abort() };
      const onSigint = () => { controller.abort(); };
      process.on("SIGINT", onSigint);
      const deps = defaultDevDeps(make, project, { noBuild: o.build === false });
      try { await runDev(process.cwd(), project, { noBuild: o.build === false }, deps, stop); }
      catch (e) { printError(e); process.exitCode = 1; }
      finally { process.removeListener("SIGINT", onSigint); }
    });

  // down
  program.command("down")
    .description("Delete the dev server bound in truetick.toml")
    .option("--yes", "confirm deletion")
    .action(async (o) => {
      const project = loadProject(process.cwd());
      if (!project) { console.error("No truetick.toml — nothing to tear down."); process.exitCode = 1; return; }
      try { await runDown(make(), project, { yes: !!o.yes }); }
      catch (e) { printError(e); process.exitCode = 1; }
    });

  // signup
  program.command("signup")
    .description("Create an account and save a CLI key")
    .requiredOption("--email <email>", "your email")
    .option("--password <password>", "your password (omit to be prompted)")
    .option("--url <baseUrl>", "API base URL")
    .action(async (o) => {
      const baseUrl = o.url ?? process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";
      const password = o.password ?? (await promptHidden("Password: "));
      try { await runSignup(defaultAuthIO, baseUrl, o.email, password); }
      catch (e) { printError(e); process.exitCode = 1; }
    });

  // login
  program.command("login")
    .description("Log in: --key ttk_… (paste) or --email + --password (mint a key)")
    .option("--key <ttk>", "API key (starts with ttk_)")
    .option("--email <email>", "email (with --password)")
    .option("--password <password>", "password (mint a key; omit value to be prompted)")
    .option("--url <baseUrl>", "API base URL")
    .action(async (o) => {
      if (o.key) {
        saveConfig({ apiKey: o.key, baseUrl: o.url });
        console.log("Saved to ~/.truetick/config.json");
        return;
      }
      if (o.password !== undefined || o.email) {
        const baseUrl = o.url ?? process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";
        if (!o.email) { console.error("--email is required with --password"); process.exitCode = 1; return; }
        const password = o.password || (await promptHidden("Password: "));
        try { await runLoginPassword(defaultAuthIO, baseUrl, o.email, password); }
        catch (e) { printError(e); process.exitCode = 1; }
        return;
      }
      const baseUrl = o.url ?? process.env.TRUETICK_API_URL ?? "https://api.truetick.gg";
      try { await runDeviceLogin(defaultDeviceDeps(baseUrl), baseUrl); }
      catch (e) { printError(e); process.exitCode = 1; }
    });

  // topup
  program.command("topup")
    .description("Add funds to your wallet via a Paddle checkout link")
    .requiredOption("--amount <usd>", "amount in USD ($5-$100, whole dollars)")
    .action(async (o) => {
      try { await runTopup(defaultTopupDeps(make), Number(o.amount)); }
      catch (e) { printError(e); process.exitCode = 1; }
    });

  // logout
  program.command("logout")
    .description("Remove the saved CLI credentials")
    .action(() => { clearConfig(); console.log("Logged out (removed ~/.truetick/config.json)."); });

  return program;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("truetick")) {
  buildProgram().parseAsync(process.argv);
}
