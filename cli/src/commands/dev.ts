import chokidar from "chokidar";
import { ProjectConfig } from "../project.js";
import { runDeploy, defaultDeployDeps } from "./deploy.js";
import { DeployVerdict } from "../confirm.js";

export interface DevOpts { noBuild?: boolean }

export interface DevDeps {
  watch: (glob: string, cwd: string) => { on: (ev: string, cb: (p: string) => void) => any; close: () => Promise<void> };
  deploy: (cwd: string) => Promise<DeployVerdict>;
  tail: (signal: AbortSignal) => Promise<void>;
  log: (s: string) => void;
  debounceMs: number;
}

export interface DevStop { signal: AbortSignal; abort: () => void }

export function defaultDevDeps(make: () => any, project: ProjectConfig, opts: DevOpts): DevDeps {
  return {
    watch: (glob, cwd) => chokidar.watch(glob, { cwd, ignoreInitial: true }),
    deploy: (cwd) => runDeploy(make(), project, cwd, { noBuild: opts.noBuild }, defaultDeployDeps),
    tail: async (signal) => {
      for await (const line of make().servers.streamLogs(project.server, { tail: 0, signal })) console.log(line);
    },
    log: (s) => console.log(s),
    debounceMs: 400,
  };
}

// runDev deploys once, starts a live log tail, then redeploys (debounced) on every
// artifact change until stop.signal aborts.
export async function runDev(cwd: string, project: ProjectConfig, _opts: DevOpts, deps: DevDeps, stop: DevStop): Promise<void> {
  deps.log("Watching for changes — Ctrl-C to stop.");

  // Bring the watcher up before the (possibly slow) initial deploy so no change is missed.
  let timer: NodeJS.Timeout | null = null;
  const watcher = deps.watch(project.artifact, cwd);
  const trigger = () => {
    if (stop.signal.aborted) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { deps.deploy(cwd).catch((e) => deps.log(`deploy error: ${(e as Error).message}`)); }, deps.debounceMs);
  };
  watcher.on("add", trigger).on("change", trigger);

  await deps.deploy(cwd).catch((e) => deps.log(`deploy error: ${(e as Error).message}`));
  // Live log tail runs concurrently; failures are non-fatal to the watch loop.
  void deps.tail(stop.signal).catch(() => {});

  await new Promise<void>((resolve) => {
    const check = () => { if (stop.signal.aborted) { resolve(); return; } setTimeout(check, 20); };
    check();
  });
  if (timer) clearTimeout(timer);
  await watcher.close();
}
