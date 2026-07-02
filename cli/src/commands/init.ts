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
  let server: { id: string; type?: string };

  if (opts.server) {
    server = await client.servers.get(opts.server);
  } else if (opts.create) {
    if (!opts.name) throw new Error("--name is required with --create");
    const ram = opts.ram ?? 4096;
    // Honesty: surface the cost before creating anything.
    deps.log(`About to create a metered, scale-to-zero dev server "${opts.name}" (${ram} MB).`);
    deps.log("You are billed only while it is awake; idle = scale-to-zero = free. Remove it any time with `truetick down`.");
    if (!opts.yes) throw new Error("refusing to create a server without --yes (pass --yes to confirm the metered charge)");
    server = await client.servers.create({
      name: opts.name, ramMb: ram, type: opts.type, version: opts.version, plan: "metered", region: opts.region,
    });
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
    ephemeral: !!opts.create,
  };
  deps.saveProject(cwd, cfg);
  deps.log(`Wrote truetick.toml — bound to ${server.id} (${server.type ?? "server"}). Next: truetick deploy`);
  return cfg;
}
