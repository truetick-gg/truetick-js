import { ProjectConfig } from "../project.js";

export interface DownOpts { yes?: boolean }
export interface DownDeps { log: (s: string) => void }

export async function runDown(client: any, project: ProjectConfig, opts: DownOpts, deps: DownDeps = { log: (s) => console.log(s) }): Promise<void> {
  if (!opts.yes) throw new Error(`refusing to delete ${project.server} without --yes`);
  if (project.ephemeral !== true) deps.log(`Warning: ${project.server} was not created by \`truetick init\` (ephemeral=false). Deleting anyway.`);
  await client.servers.delete(project.server);
  deps.log(`Deleted ${project.server}.`);
}
