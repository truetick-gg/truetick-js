/** Converts a raw user-supplied name into a DNS-safe slug (server ID). */
export function parseLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

/** Builds the full game hostname from a label + base domain. */
export function serverHostname(label: string, domain: string): string {
  return domain ? `${label}.${domain}` : label;
}

/**
 * Derives the game domain from an API base URL.
 * e.g. "https://api.truetick.gg" → "truetick.gg"
 *      "http://localhost:8080"    → ""
 *      "https://127.0.0.1"       → ""
 */
export function gameDomainFromBaseUrl(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    if (host === "localhost" || /^[\d.]+$/.test(host)) return "";
    return host.startsWith("api.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}
