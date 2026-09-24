import { TrueTickError } from "@truetick/sdk";

export function printResult(data: unknown, json: boolean): void {
  if (json) { console.log(JSON.stringify(data, null, 2)); return; }
  if (Array.isArray(data)) { console.table(data); return; }
  console.log(JSON.stringify(data, null, 2));
}

export function printError(err: unknown): void {
  if (err instanceof TrueTickError) {
    const wait = err.retryAfter !== undefined ? ` (retry after ${err.retryAfter}s)` : "";
    const label = errorLabel(err);
    console.error(`Error${label ? ` (${label})` : ""}: ${err.message}${wait}`);
  }
  else console.error(`Error: ${(err as Error).message ?? String(err)}`);
}

// errorLabel is the code worth printing, if any. The gRPC code is the honest
// label (resource_exhausted, not rate_limited: `code` only knows the HTTP 429).
// It does not tell a rate limit from a capacity refusal, both are
// resource_exhausted; the message does. Without a gRPC code in the body (the
// onboarding endpoints, the log stream), a 429 has no honest label at all: it is
// a rate limit or a limit that never clears by itself, like the 25-key cap on a
// password login (pkg-04). Then the message says which, alone.
function errorLabel(err: TrueTickError): string | undefined {
  if (err.grpcCode) return err.grpcCode;
  return err.status === 429 ? undefined : err.code;
}
