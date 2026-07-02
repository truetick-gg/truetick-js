import open from "open";
import type { TrueTickClient } from "@truetick/sdk";

export interface TopupDeps {
  /** Create a Paddle checkout link for the given USD amount. */
  createCheckout: (amountUsd: number) => Promise<{ checkoutUrl: string }>;
  /** Open the checkout URL in a browser. May throw — failure is non-fatal. */
  openBrowser: (url: string) => Promise<void>;
  /** Return the current wallet balance in microdollars. May throw transiently. */
  walletBalance: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  log: (s: string) => void;
  deadlineMs: number;
  pollMs: number;
  now?: () => number;
}

export function defaultTopupDeps(make: () => TrueTickClient): TopupDeps {
  return {
    createCheckout: (amountUsd) => make().billing.createCheckout(amountUsd),
    openBrowser: async (url) => { await open(url); },
    walletBalance: async () => (await make().wallet.get()).balanceMicros,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (s) => console.log(s),
    deadlineMs: 5 * 60 * 1000, // 5 minutes
    pollMs: 2000,               // 2 seconds
  };
}

export async function runTopup(deps: TopupDeps, amountUsd: number): Promise<void> {
  const now = deps.now ?? (() => Date.now());

  // Read starting balance before creating the checkout link.
  const startBalance = await deps.walletBalance();

  // Create the checkout link.
  const { checkoutUrl } = await deps.createCheckout(amountUsd);

  // Print and open the URL. openBrowser failure is non-fatal.
  deps.log(`Open this URL to complete your payment: ${checkoutUrl}`);
  try {
    await deps.openBrowser(checkoutUrl);
  } catch {
    deps.log(`(Could not open browser automatically — open the URL above manually.)`);
  }

  deps.log("Waiting for payment confirmation…");

  const deadline = now() + deps.deadlineMs;

  while (now() < deadline) {
    let balance: number;
    try {
      balance = await deps.walletBalance();
    } catch {
      // Transient error — keep polling until the deadline.
      await deps.sleep(deps.pollMs);
      continue;
    }

    if (balance > startBalance) {
      const dollars = (balance / 1_000_000).toFixed(2);
      deps.log(`✓ Funds added — new balance: $${dollars}`);
      return;
    }

    await deps.sleep(deps.pollMs);
  }

  const minutes = Math.round(deps.deadlineMs / 60_000);
  deps.log(
    `Didn't see payment within ${minutes} min. Run \`truetick wallet\` to check your balance.`
  );
}
