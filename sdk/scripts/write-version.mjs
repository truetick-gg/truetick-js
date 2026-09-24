// Writes src/version.ts from package.json. `npm run build` runs it first
// (prebuild), so the version compiled into dist is the one being published.
//
// The SDK used to read ../package.json at runtime instead. Bundled into an app
// (esbuild, tsup, ncc), that read finds whatever sits one level above the
// bundle, often the app's own manifest, so the User-Agent named the app's
// version or "undefined". Its `node:module` import also kept the SDK out of
// browser and edge bundles.
//
// --check writes nothing and exits 1 when src/version.ts is not what this
// script would write; test/version.test.ts runs it that way.
import { readFileSync, writeFileSync } from "node:fs";

const pkgUrl = new URL("../package.json", import.meta.url);
const outUrl = new URL("../src/version.ts", import.meta.url);

const { version } = JSON.parse(readFileSync(pkgUrl, "utf8"));
if (typeof version !== "string" || version === "") {
  console.error("write-version: package.json has no version");
  process.exit(1);
}

const want = [
  "// Generated from package.json by scripts/write-version.mjs, which `npm run build`",
  "// runs first. Bump the version in package.json, not here. A constant, because a",
  "// runtime read of package.json finds the host app's manifest once the SDK is",
  "// bundled into it.",
  `export const SDK_VERSION = ${JSON.stringify(version)};`,
  "",
  "export const SDK_USER_AGENT = `truetick-sdk/${SDK_VERSION}`;",
  "",
].join("\n");

let have = "";
try {
  have = readFileSync(outUrl, "utf8");
} catch {
  // Not generated yet.
}

if (process.argv.includes("--check")) {
  if (have.replace(/\r\n/g, "\n") !== want) {
    console.error(`write-version: src/version.ts does not match package.json (${version}); run \`npm run build\` or \`node scripts/write-version.mjs\``);
    process.exit(1);
  }
} else if (have !== want) {
  writeFileSync(outUrl, want);
}
