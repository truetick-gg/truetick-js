export interface TrueTickErrorDetails {
  /** gRPC status name from the API's error body, e.g. "failed_precondition". */
  grpcCode?: string;
  /** Seconds to wait, from the response's Retry-After header, when the server sent one. */
  retryAfter?: number;
  /** The `details` array of the API's gRPC status body, as sent. */
  details?: unknown[];
}

export class TrueTickError extends Error {
  grpcCode?: string;
  retryAfter?: number;
  details?: unknown[];
  constructor(public status: number, public code: string, message: string, extra: TrueTickErrorDetails = {}) {
    super(message);
    this.name = "TrueTickError";
    this.grpcCode = extra.grpcCode;
    this.retryAfter = extra.retryAfter;
    this.details = extra.details;
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

// Canonical gRPC code names (google.golang.org/grpc/codes), indexed by number.
// grpc-gateway puts the number in its error body; the name is what to branch on.
const GRPC_CODE_NAMES = [
  "ok", "cancelled", "unknown", "invalid_argument", "deadline_exceeded", "not_found",
  "already_exists", "permission_denied", "resource_exhausted", "failed_precondition",
  "aborted", "out_of_range", "unimplemented", "internal", "unavailable", "data_loss",
  "unauthenticated",
];

// Longest plain-text body taken as a message. The API's own plain-text refusals
// (the SSE log stream's http.Error) are one short line; anything longer is not
// something the API wrote.
const MAX_PLAIN_MESSAGE = 500;

// RFC 9110 reason phrases. The log stream's key and ownership refusals are
// nothing but the status word ("forbidden"); errorFor's sentence for the
// status says more (a 403 there is a key without servers:read).
const REASON_PHRASES: Record<number, string> = {
  400: "bad request", 401: "unauthorized", 403: "forbidden", 404: "not found",
  409: "conflict", 429: "too many requests", 500: "internal server error",
  501: "not implemented", 502: "bad gateway", 503: "service unavailable", 504: "gateway timeout",
};

function onlyStatusWord(text: string, status: number): boolean {
  return text.toLowerCase().replace(/\.$/, "") === REASON_PHRASES[status];
}

interface ParsedBody { message?: string; grpcCode?: string; details?: unknown[] }

function parseErrorBody(text: string, contentType: string, status: number): ParsedBody {
  const trimmed = text.trim();
  if (!trimmed) return {};
  let body: unknown;
  try { body = JSON.parse(trimmed); } catch { body = undefined; }
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    // grpc-gateway: {"code": 9, "message": "...", "details": []}
    if (typeof o.code === "number" && typeof o.message === "string") {
      return {
        message: o.message || undefined,
        grpcCode: GRPC_CODE_NAMES[o.code],
        details: Array.isArray(o.details) ? o.details : undefined,
      };
    }
    // Raw handlers (signup, login, device flow): {"error": "..."}
    if (typeof o.error === "string") return { message: o.error || undefined };
    return {};
  }
  // The SSE log stream refuses with http.Error: text/plain, one line. An HTML
  // page from a proxy in front of the API is never a message, and neither is
  // a line that only repeats the status word.
  if (!/^text\/plain\b/i.test(contentType) || trimmed.length > MAX_PLAIN_MESSAGE) return {};
  return onlyStatusWord(trimmed, status) ? {} : { message: trimmed };
}

// Retry-After is either delay-seconds or an HTTP-date (RFC 9110 §10.2.3); any
// other value says nothing, and the caller's own backoff applies. Date.parse
// alone accepts far more: it reads "-5" and "1.5" as dates in 2001, which made
// retryAfter 0 and a retry loop hammer at once. So a date counts only when it
// is an IMF-fixdate, the one form a sender may generate, and names a real
// instant: Date#toUTCString prints exactly that form (ECMA-262), so the value
// must print back unchanged. The two obsolete forms count as absent: V8 reads
// asctime in local time.
function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (Number.isNaN(at) || new Date(at).toUTCString() !== v) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** What a non-2xx response said about itself; `message` is absent when the body carried no text of its own. */
export interface Refusal extends TrueTickErrorDetails { message?: string }

/** readRefusal reads a non-2xx response's body and Retry-After header. */
export async function readRefusal(res: Response): Promise<Refusal> {
  let text = "";
  try { text = await res.text(); } catch { /* unreadable body: nothing said */ }
  const headers = res.headers as Headers | undefined;
  const parsed = parseErrorBody(text, headers?.get?.("content-type") ?? "", res.status);
  return { ...parsed, retryAfter: parseRetryAfter(headers?.get?.("retry-after")) };
}

/**
 * errorFromResponse turns a non-2xx response into a TrueTickError that says
 * what the server said. `status` and `code` keep their meaning (code is still
 * derived from the HTTP status); `message` is the server's own text when the
 * body carried one, else `fallbackMessage`, else the status's generic text.
 */
export async function errorFromResponse(res: Response, fallbackMessage?: string): Promise<TrueTickError> {
  const said = await readRefusal(res);
  const generic = errorFor(res.status);
  return new TrueTickError(res.status, generic.code, said.message ?? fallbackMessage ?? generic.message, said);
}
