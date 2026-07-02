import { describe, it, expect, vi } from "vitest";
import { printResult } from "../src/output.js";

describe("printResult", () => {
  it("prints JSON when json=true", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult({ a: 1 }, true);
    expect(spy.mock.calls[0][0]).toBe(JSON.stringify({ a: 1 }, null, 2));
    spy.mockRestore();
  });
  it("prints a table for an array when json=false", () => {
    const spy = vi.spyOn(console, "table").mockImplementation(() => {});
    printResult([{ id: "s1" }], false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
