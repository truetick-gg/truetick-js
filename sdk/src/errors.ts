export class TrueTickError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "TrueTickError";
  }
}

export function errorFor(status: number): TrueTickError {
  const map: Record<number, [string, string]> = {
    401: ["unauthorized", "Invalid API key — check your ttk_ key."],
    403: ["forbidden", "Your API key lacks the required scope for this operation."],
    404: ["not_found", "Not found — wrong server id or path."],
    429: ["rate_limited", "Rate limited — slow down and retry shortly."],
  };
  const [code, msg] = map[status] ?? (status >= 500 ? ["server_error", "TrueTick API server error."] : ["http_error", `API error (HTTP ${status}).`]);
  return new TrueTickError(status, code, msg);
}
