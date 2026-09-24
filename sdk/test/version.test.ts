import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Read independently of src/: the header must name the SDK's own version.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

// Bundled into someone's app (esbuild, a serverless build), the SDK's own
// package.json is no longer next to the code. Reading it must not throw at
// import time and take the whole SDK down with it.
// Worse, a runtime require("../package.json") from the bundle finds whatever
// sits one level above it — often the app's own manifest. The header then
// named the app's version ("truetick-sdk/9.9.9"), or "truetick-sdk/undefined"
// when the app's manifest had none.
const aboveTheBundle = vi.hoisted(() => ({ manifest: undefined as unknown }));
vi.mock("node:module", () => ({
  createRequire: () => () => {
    if (aboveTheBundle.manifest === undefined) throw new Error("Cannot find module '../package.json'");
    return aboveTheBundle.manifest;
  },
}));

describe("SDK version", () => {
  beforeEach(() => {
    aboveTheBundle.manifest = undefined;
    vi.resetModules();
  });

  it("names its own version when its package.json is out of reach", async () => {
    const { SDK_USER_AGENT } = await import("../src/version.js");
    expect(SDK_USER_AGENT).toBe(`truetick-sdk/${pkg.version}`);
  });

  it("never names the version of the app it is bundled into", async () => {
    aboveTheBundle.manifest = { name: "my-app", version: "9.9.9" };
    const { SDK_USER_AGENT } = await import("../src/version.js");
    expect(SDK_USER_AGENT).toBe(`truetick-sdk/${pkg.version}`);
  });

  it("never says 'undefined' when the app's manifest has no version", async () => {
    aboveTheBundle.manifest = { name: "x" };
    const { SDK_USER_AGENT } = await import("../src/version.js");
    expect(SDK_USER_AGENT).toBe(`truetick-sdk/${pkg.version}`);
  });

  // `npm run build` regenerates src/version.ts from package.json first; a
  // committed copy that lags a version bump fails here, before a publish.
  it("src/version.ts is what scripts/write-version.mjs writes from package.json", () => {
    const script = fileURLToPath(new URL("../scripts/write-version.mjs", import.meta.url));
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
});

// A `node:` import doesn't resolve in a browser bundle (Vite, webpack) or in a
// Worker without nodejs_compat, so one such import fails the whole build,
// methods that never touch Node included. The version read brought the first.
describe("SDK source", () => {
  it("imports no node: builtin", () => {
    const srcDir = new URL("../src/", import.meta.url);
    const offenders = readdirSync(srcDir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']node:/.test(readFileSync(new URL(f, srcDir), "utf8")));
    expect(offenders).toEqual([]);
  });

  // Node's ESM loader takes a relative specifier as written: "./errors" is not
  // "./errors.js". tsc (moduleResolution "bundler") accepts the short form and
  // emits it verbatim, and vitest fills in the extension, so the build and this
  // whole suite passed while `import("@truetick/sdk")` under Node threw
  // ERR_MODULE_NOT_FOUND. One such import in app.ts did exactly that.
  it("names the .js file in every relative import and export", () => {
    const specs = relativeSpecifiers(new URL("../src/", import.meta.url));
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => !s.endsWith(".js"))).toEqual([]);
  });
});

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
