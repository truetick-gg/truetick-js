export interface DeployVerdict { ok: boolean; detail: string }

const FAIL_RE = /(^|\s)(java\.[\w.]+(Exception|Error)|Caused by:|NoClassDefFoundError|Could not load|Error occurred while enabling)/i;

// scanDeployLogs returns a verdict once the logs prove success or failure, else null (keep polling).
export function scanDeployLogs(lines: string[], name?: string): DeployVerdict | null {
  for (const line of lines) {
    if (FAIL_RE.test(line)) return { ok: false, detail: line.trim() };
  }
  for (const line of lines) {
    // Bukkit/Paper: "[Name] Enabling Name vX" / generic "Enabling Name". Vanilla/Fabric: "Done (Xs)!".
    if (name && new RegExp(`Enabling\\s+${escapeRe(name)}\\b`, "i").test(line))
      return { ok: true, detail: line.trim() };
    if (/\bDone \(\d/.test(line)) return { ok: true, detail: line.trim() };
  }
  return null;
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

interface RecentLogsClient { servers: { recentLogs: (id: string, opts?: { tail?: number; cursor?: string }) => Promise<{ lines: string[]; cursor: string; containerMissing: boolean }> } }

export async function confirmDeploy(
  client: RecentLogsClient,
  id: string,
  name: string | undefined,
  opts: { cursor?: string; deadlineMs?: number; pollMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<DeployVerdict> {
  const deadlineMs = opts.deadlineMs ?? 60_000;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const start = now();
  let cursor = opts.cursor;
  // When anchored on a pre-restart cursor, follow it from the first poll so we
  // scan only post-restart lines (logs persist across an in-place restart);
  // otherwise fall back to a tail window.
  while (now() - start < deadlineMs) {
    const res = await client.servers.recentLogs(id, cursor !== undefined ? { cursor } : { tail: 200 });
    cursor = res.cursor ?? cursor;
    const v = scanDeployLogs(res.lines, name);
    if (v) return v;
    await sleep(pollMs);
  }
  return { ok: false, detail: "timed out waiting for the server to confirm the plugin loaded" };
}
