import { detectBuild as realDetectBuild, targetForType, saveProject as realSaveProject, ProjectConfig } from "../project.js";

export interface InitOpts {
  server?: string;
  create?: boolean;
  name?: string;
  ram?: number;
  type?: string;
  version?: string;
  region?: string;
  yes?: boolean;
}

export interface InitDeps {
  detectBuild: (cwd: string) => { build?: string; artifact: string };
  saveProject: (cwd: string, cfg: ProjectConfig) => void;
  log: (s: string) => void;
}

export const defaultInitDeps: InitDeps = { detectBuild: realDetectBuild, saveProject: realSaveProject, log: (s) => console.log(s) };

export async function runInit(client: any, cwd: string, opts: InitOpts, deps: InitDeps = defaultInitDeps): Promise<ProjectConfig> {
  // `down` deletes only an ephemeral server, and ephemeral must mean "made by
  // this init". The pair used to bind the --server one and still write
  // ephemeral = true, so `down --yes` deleted a real server (pkg-02).
  if (opts.server && opts.create) {
    throw new Error("--server and --create can't be used together: --server binds an existing server, --create makes a new dev server that `truetick down` may delete");
  }
  let server: { id: string; type?: string };
  let created = false;

  if (opts.server) {
    server = await client.servers.get(opts.server);
  } else if (opts.create) {
    if (!opts.name) throw new Error("--name is required with --create");
    const ram = opts.ram ?? 4096;
    // Honesty: surface the cost before creating anything. An empty server is
    // billed until its idle timeout puts it to sleep (internal/billing/meter.go
    // bills every running server each tick); only asleep is free. `down`
    // refuses without --yes, so the hint names it.
    deps.log(`About to create a metered, scale-to-zero dev server "${opts.name}" (${ram} MB).`);
    deps.log("You are billed only while it is awake: it sleeps once it has been empty for its idle timeout, and asleep costs nothing. Remove it any time with `truetick down --yes`.");
    if (!opts.yes) throw new Error("refusing to create a server without --yes (pass --yes to confirm the metered charge)");
    server = await client.servers.create({
      name: opts.name, ramMb: ram, type: opts.type, version: opts.version, plan: "metered", region: opts.region,
    });
    created = true;
  } else {
    throw new Error("specify --server <id> to bind, or --create to provision a new dev server");
  }

  const { build, artifact } = deps.detectBuild(cwd);
  const cfg: ProjectConfig = {
    server: server.id,
    target: targetForType(server.type),
    build,
    artifact,
    on_deploy: "restart",
    // What this run did, not which flag was passed: only a server made here is
    // one `down` may delete.
    ephemeral: created,
  };
  deps.saveProject(cwd, cfg);
  deps.log(`Wrote truetick.toml — bound to ${server.id} (${server.type ?? "server"}). Next: truetick deploy`);
  return cfg;
}
