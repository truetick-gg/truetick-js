import { posix, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { ProjectConfig, newestArtifact as realNewestArtifact } from "../project.js";
import { uploadFile as realUpload } from "../sftp.js";
import { confirmDeploy as realConfirm, DeployVerdict } from "../confirm.js";

export interface DeployOpts { noBuild?: boolean; reload?: boolean }

export interface DeployDeps {
  runBuild: (cmd: string, cwd: string) => { ok: boolean; output: string };
  newestArtifact: (cwd: string, glob: string) => string;
  upload: (cred: any, local: string, remote: string) => Promise<void>;
  confirm: (client: any, id: string, name: string, cursor?: string) => Promise<DeployVerdict>;
  log: (s: string) => void;
}

export function realRunBuild(cmd: string, cwd: string): { ok: boolean; output: string } {
  const parts = cmd.split(/\s+/);
  const r = spawnSync(parts[0], parts.slice(1), { cwd, encoding: "utf8", shell: process.platform === "win32" });
  // spawn failures (e.g. ENOENT) leave status/stdout/stderr null and set r.error;
  // surface the error message instead of a blank "build failed:".
  return { ok: r.status === 0 && !r.error, output: r.error ? r.error.message : (r.stdout ?? "") + (r.stderr ?? "") };
}

export const defaultDeployDeps: DeployDeps = {
  runBuild: realRunBuild,
  newestArtifact: realNewestArtifact,
  upload: realUpload,
  confirm: (client, id, name, cursor) => realConfirm(client, id, name, { cursor }),
  log: (s) => console.log(s),
};

export async function runDeploy(client: any, project: ProjectConfig, cwd: string, opts: DeployOpts, deps: DeployDeps = defaultDeployDeps): Promise<DeployVerdict> {
  if (!opts.noBuild && project.build) {
    deps.log(`[build] ${project.build}`);
    const b = deps.runBuild(project.build, cwd);
    if (!b.ok) throw new Error(`build failed:\n${b.output.trim()}`);
  }

  const jar = deps.newestArtifact(cwd, project.artifact);
  const name = basename(jar).replace(/\.jar$/i, "");
  const remote = posix.join(project.target, basename(jar));

  deps.log(`[upload] ${basename(jar)} -> ${remote}`);
  const cred = await client.servers.enableSftp(project.server);
  await deps.upload(cred, jar, remote);

  // Anchor on the current log end so confirm scans only post-restart lines (logs persist across an in-place restart).
  const anchor = (await client.servers.recentLogs(project.server, { tail: 0 })).cursor;

  // reload is deferred to Phase 3; Phase 1 always performs a full restart.
  deps.log(`[restart]${opts.reload ? " (reload requested; full restart in Phase 1)" : ""} ${project.server}`);
  await client.servers.restart(project.server);

  deps.log("[confirm] waiting for the server to load the jar…");
  const verdict = await deps.confirm(client, project.server, name, anchor);
  deps.log(verdict.ok ? `✓ ${name} loaded — ${verdict.detail}` : `✗ ${name} failed — ${verdict.detail}`);
  return verdict;
}
