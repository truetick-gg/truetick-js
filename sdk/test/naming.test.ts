import { describe, it, expect } from "vitest";
import { parseLabel, gameDomainFromBaseUrl, serverHostname } from "../src/naming.js";

describe("parseLabel", () => {
  it("lowercases and keeps alphanumeric + hyphens", () => {
    expect(parseLabel("My Server 1")).toBe("my-server-1");
  });
  it("strips leading/trailing hyphens", () => {
    expect(parseLabel("---hello---")).toBe("hello");
  });
  it("collapses each run of special chars into a single hyphen", () => {
    // "__" is one run → one "-"; trailing "!!" run → "-" then stripped by trim
    expect(parseLabel("hello__world!!")).toBe("hello-world");
    expect(parseLabel("hello--world")).toBe("hello--world"); // hyphens are allowed through
  });
  it("truncates at 63 chars", () => {
    const long = "a".repeat(70);
    expect(parseLabel(long).length).toBeLessThanOrEqual(63);
  });
  it("returns empty string for all-special input", () => {
    expect(parseLabel("---!!!---")).toBe("");
  });
});

describe("gameDomainFromBaseUrl", () => {
  it("strips api. prefix", () => {
    expect(gameDomainFromBaseUrl("https://api.truetick.gg")).toBe("truetick.gg");
  });
  it("returns empty for localhost", () => {
    expect(gameDomainFromBaseUrl("http://localhost:8080")).toBe("");
  });
  it("returns empty for bare IP", () => {
    expect(gameDomainFromBaseUrl("https://127.0.0.1")).toBe("");
  });
  it("returns host unchanged when no api. prefix", () => {
    expect(gameDomainFromBaseUrl("https://truetick.gg")).toBe("truetick.gg");
  });
  it("returns empty for invalid URL", () => {
    expect(gameDomainFromBaseUrl("not-a-url")).toBe("");
  });
});

describe("serverHostname", () => {
  it("combines label and domain", () => {
    expect(serverHostname("myserver", "truetick.gg")).toBe("myserver.truetick.gg");
  });
  it("returns bare label when domain is empty", () => {
    expect(serverHostname("myserver", "")).toBe("myserver");
  });
});
