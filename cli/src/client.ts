import { TrueTickClient } from "@truetick/sdk";
import { CLI_USER_AGENT } from "./version.js";

// cliClient is the client every CLI command talks to the API through. Its
// requests name the CLI ahead of the SDK ("truetick-cli/0.2.0
// truetick-sdk/0.3.0"), so a request says which install sent it.
export function cliClient(apiKey: string, baseUrl?: string): TrueTickClient {
  return new TrueTickClient({ apiKey, baseUrl, userAgent: CLI_USER_AGENT });
}
