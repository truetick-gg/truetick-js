import { describe, it, expect, vi } from "vitest";
import { buildProgram } from "../src/index.js";

describe("logs command", () => {
  it("logs <id> --tail 50 calls recentLogs with tail and prints each line", async () => {
    const recentLogs = vi.fn(async () => ({
      lines: ["a", "b"],
      cursor: "cursor-1",
      containerMissing: false,
    }));
    const fakeClient = () => ({ servers: { recentLogs } } as any);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(fakeClient).parseAsync([
      "node", "truetick", "logs", "s1", "--tail", "50",
    ]);
    expect(recentLogs).toHaveBeenCalledWith("s1", { tail: 50 });
    expect(spy).toHaveBeenCalledWith("a");
    expect(spy).toHaveBeenCalledWith("b");
    spy.mockRestore();
  });

  it("logs <id> --follow streams lines from async iterable until done", async () => {
    async function* fakeStream(): AsyncIterable<string> {
      yield "x";
      yield "y";
    }
    const streamLogs = vi.fn(() => fakeStream());
    const fakeClient = () => ({ servers: { streamLogs } } as any);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await buildProgram(fakeClient).parseAsync([
      "node", "truetick", "logs", "s1", "--follow",
    ]);
    expect(streamLogs).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(spy).toHaveBeenCalledWith("x");
    expect(spy).toHaveBeenCalledWith("y");
    spy.mockRestore();
  });
});
