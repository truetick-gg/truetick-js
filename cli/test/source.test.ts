import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// relativeSpecifiers lists "<file>: <specifier>" for every relative import,
// export-from and dynamic import under dir, subdirectories included.
function relativeSpecifiers(dir: URL, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...relativeSpecifiers(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith(".ts")) {
      const text = readFileSync(new URL(entry.name, dir), "utf8");
      for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g)) {
        out.push(`${prefix}${entry.name}: ${m[1]}`);
      }
    }
  }
  return out;
}

// `truetick` runs as plain Node ESM, which takes a relative specifier as
// written: "./output" is not "./output.js". tsc (moduleResolution "bundler")
// emits the short form verbatim and vitest fills in the extension, so the build
// and this suite pass while every command dies at startup with
// ERR_MODULE_NOT_FOUND. The SDK shipped one such import (sdk/src/app.ts).
describe("CLI source", () => {
  it("names the .js file in every relative import and export", () => {
    const specs = relativeSpecifiers(new URL("../src/", import.meta.url));
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => !s.endsWith(".js"))).toEqual([]);
  });
});
