import { describe, it, expect, vi } from "vitest";
import { runSignup, runLoginPassword, runDeviceLogin } from "../src/commands/auth.js";

describe("runSignup", () => {
  it("calls signup, saves the key, prints a verify hint", async () => {
    const io = {
      signup: vi.fn(async () => ({ apiKey: "ttk_x", accountId: "acc-1", email: "u@x.com", emailVerified: false })),
      login: vi.fn(),
      save: vi.fn(),
      log: vi.fn(),
    };
    await runSignup(io as any, "https://api.example.com", "u@x.com", "password1");
    expect(io.signup).toHaveBeenCalledWith("https://api.example.com", "u@x.com", "password1");
    expect(io.save).toHaveBeenCalledWith({ apiKey: "ttk_x", baseUrl: "https://api.example.com" });
    expect(io.log).toHaveBeenCalledWith(expect.stringMatching(/verify/i));
  });
});

describe("runLoginPassword", () => {
  it("calls login and saves the key", async () => {
    const io = { signup: vi.fn(), login: vi.fn(async () => ({ apiKey: "ttk_y", accountId: "a", email: "u@x.com", emailVerified: true })), save: vi.fn(), log: vi.fn() };
    await runLoginPassword(io as any, "https://api.example.com", "u@x.com", "password1");
    expect(io.login).toHaveBeenCalledWith("https://api.example.com", "u@x.com", "password1");
    expect(io.save).toHaveBeenCalledWith({ apiKey: "ttk_y", baseUrl: "https://api.example.com" });
  });
});

describe("runDeviceLogin", () => {
  it("runDeviceLogin opens the browser and saves the key when approved", async () => {
    const deps = {
      start: vi.fn(async () => ({ deviceCode: "d", userCode: "WXYZ-1234", verifyUrl: "https://p/cli-auth?code=WXYZ-1234" })),
      poll: vi.fn().mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "approved", apiKey: "ttk_z" }),
      openBrowser: vi.fn(async () => {}),
      sleep: vi.fn(async () => {}),
      log: vi.fn(), save: vi.fn(),
      deadlineMs: 10_000, pollMs: 0,
    };
    await runDeviceLogin(deps as any, "https://api.example.com");
    expect(deps.openBrowser).toHaveBeenCalledWith("https://p/cli-auth?code=WXYZ-1234");
    expect(deps.save).toHaveBeenCalledWith({ apiKey: "ttk_z", baseUrl: "https://api.example.com" });
  });

  it("tolerates a transient poll failure and still logs in when approved", async () => {
    const deps = {
      start: vi.fn(async () => ({ deviceCode: "d", userCode: "WXYZ-1234", verifyUrl: "https://p/cli-auth?code=WXYZ-1234" })),
      // First poll throws (transient 429/5xx/404); login must NOT abort — it keeps
      // polling and succeeds on the next, approved, response.
      poll: vi.fn().mockRejectedValueOnce(new Error("503 Service Unavailable")).mockResolvedValueOnce({ status: "approved", apiKey: "ttk_z" }),
      openBrowser: vi.fn(async () => {}),
      sleep: vi.fn(async () => {}),
      log: vi.fn(), save: vi.fn(),
      deadlineMs: 10_000, pollMs: 0,
    };
    await runDeviceLogin(deps as any, "https://api.example.com");
    expect(deps.poll).toHaveBeenCalledTimes(2);
    expect(deps.save).toHaveBeenCalledWith({ apiKey: "ttk_z", baseUrl: "https://api.example.com" });
  });
});
