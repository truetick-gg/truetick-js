import { describe, it, expect, vi } from "vitest";
import { runTopup } from "../src/commands/topup.js";

describe("runTopup", () => {
  it("opens the checkout and completes when the balance rises", async () => {
    const deps = {
      createCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.paddle.com/x" })),
      openBrowser: vi.fn(async () => {}),
      walletBalance: vi.fn().mockResolvedValueOnce(1_000_000).mockResolvedValueOnce(1_000_000).mockResolvedValueOnce(11_000_000),
      sleep: vi.fn(async () => {}),
      log: vi.fn(),
      deadlineMs: 60_000, pollMs: 0,
    };
    await runTopup(deps as any, 10);
    expect(deps.createCheckout).toHaveBeenCalledWith(10);
    expect(deps.openBrowser).toHaveBeenCalledWith("https://checkout.paddle.com/x");
    expect(deps.log).toHaveBeenCalledWith(expect.stringMatching(/added|balance|✓/i));
  });

  it("is non-fatal when openBrowser throws — prints url and continues polling", async () => {
    const deps = {
      createCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.paddle.com/y" })),
      openBrowser: vi.fn(async () => { throw new Error("spawn failed"); }),
      walletBalance: vi.fn().mockResolvedValueOnce(500_000).mockResolvedValueOnce(5_500_000),
      sleep: vi.fn(async () => {}),
      log: vi.fn(),
      deadlineMs: 60_000, pollMs: 0,
    };
    await runTopup(deps as any, 5);
    // Must not throw; browser-open fallback URL was logged
    expect(deps.log).toHaveBeenCalledWith(expect.stringMatching(/https:\/\/checkout\.paddle\.com\/y/));
    // And still resolved on balance rise
    expect(deps.log).toHaveBeenCalledWith(expect.stringMatching(/added|balance|✓/i));
  });

  it("tolerates transient walletBalance errors and succeeds when balance eventually rises", async () => {
    const deps = {
      createCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.paddle.com/z" })),
      openBrowser: vi.fn(async () => {}),
      walletBalance: vi.fn()
        .mockResolvedValueOnce(1_000_000)   // start
        .mockRejectedValueOnce(new Error("503 transient"))
        .mockResolvedValueOnce(6_000_000),  // balance rose
      sleep: vi.fn(async () => {}),
      log: vi.fn(),
      deadlineMs: 60_000, pollMs: 0,
    };
    await runTopup(deps as any, 5);
    expect(deps.log).toHaveBeenCalledWith(expect.stringMatching(/added|balance|✓/i));
  });

  it("logs a timeout message when the deadline passes without a balance rise", async () => {
    let tick = 0;
    const deps = {
      createCheckout: vi.fn(async () => ({ checkoutUrl: "https://checkout.paddle.com/timeout" })),
      openBrowser: vi.fn(async () => {}),
      walletBalance: vi.fn(async () => 1_000_000), // never rises
      sleep: vi.fn(async () => {}),
      log: vi.fn(),
      deadlineMs: 0, // deadline already past
      pollMs: 0,
      now: () => { tick += 1000; return tick; }, // always past deadline
    };
    await runTopup(deps as any, 10);
    expect(deps.log).toHaveBeenCalledWith(expect.stringMatching(/didn't see payment|run.*truetick wallet/i));
  });
});
