import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveKey } from "../src/config.js";

afterEach(() => { delete process.env.TRUETICK_API_KEY; delete process.env.TRUETICK_API_URL; });

describe("resolveKey", () => {
  it("prefers env over config file", () => {
    process.env.TRUETICK_API_KEY = "ttk_env";
    expect(resolveKey(() => ({ apiKey: "ttk_file" })).apiKey).toBe("ttk_env");
  });
  it("falls back to config file", () => {
    expect(resolveKey(() => ({ apiKey: "ttk_file" })).apiKey).toBe("ttk_file");
  });
});
