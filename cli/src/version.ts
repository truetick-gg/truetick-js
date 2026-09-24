import { createRequire } from "node:module";

// Read at runtime from this package's own package.json, which ships in every
// npm tarball, so the CLI never reports a version other than the installed one.
export const CLI_VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;

// The product token every CLI request puts ahead of the SDK's, API calls and
// onboarding (signup, login, device flow) alike, so a request says which
// install sent it: "truetick-cli/0.2.0 truetick-sdk/0.3.0".
export const CLI_USER_AGENT = `truetick-cli/${CLI_VERSION}`;
