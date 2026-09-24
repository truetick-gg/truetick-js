import { ProjectConfig } from "../project.js";

export interface DownOpts { yes?: boolean }
export interface DownDeps { log: (s: string) => void }

export async function runDown(client: any, project: ProjectConfig, opts: DownOpts, deps: DownDeps = { log: (s) => console.log(s) }): Promise<void> {
  // `down` is the dev-loop's teardown, so it deletes only the server that
  // `init --create` made for this project (ephemeral = true). `init --server`
  // binds somebody's real server and writes ephemeral = false; deleting that
  // one takes its world, files and backups with it, so it needs the explicit
  // command rather than the dev-loop's last line. This used to print a warning
  // and delete anyway (dev-03).
  if (project.ephemeral !== true) {
    throw new Error(
      `refusing to delete ${project.server}: truetick.toml does not mark it ephemeral, and \`truetick down\` only deletes a dev server made by \`truetick init --create\`. ` +
      `To delete ${project.server} with its world, files and backups, run: truetick servers delete ${project.server} --yes`,
    );
  }
  if (!opts.yes) throw new Error(`refusing to delete ${project.server} without --yes`);
  await client.servers.delete(project.server);
  deps.log(`Deleted ${project.server}.`);
}
