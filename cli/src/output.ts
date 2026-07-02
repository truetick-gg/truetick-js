import { TrueTickError } from "@truetick/sdk";

export function printResult(data: unknown, json: boolean): void {
  if (json) { console.log(JSON.stringify(data, null, 2)); return; }
  if (Array.isArray(data)) { console.table(data); return; }
  console.log(JSON.stringify(data, null, 2));
}

export function printError(err: unknown): void {
  if (err instanceof TrueTickError) console.error(`Error (${err.code}): ${err.message}`);
  else console.error(`Error: ${(err as Error).message ?? String(err)}`);
}
