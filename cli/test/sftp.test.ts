import { describe, it, expect, vi } from "vitest";
import { uploadFile } from "../src/sftp.js";

describe("uploadFile", () => {
  it("connects with the credential, ensures the dir, puts the file, and always ends", async () => {
    const calls: string[] = [];
    const fake = {
      connect: vi.fn(async () => { calls.push("connect"); }),
      mkdir: vi.fn(async () => { calls.push("mkdir"); }),
      put: vi.fn(async () => { calls.push("put"); }),
      end: vi.fn(async () => { calls.push("end"); }),
    };
    const cred = { host: "h", port: 2222, username: "u", password: "p" };
    await uploadFile(cred, "/local/My.jar", "plugins/My.jar", () => fake as any);
    expect(fake.connect).toHaveBeenCalledWith({ host: "h", port: 2222, username: "u", password: "p" });
    expect(fake.put).toHaveBeenCalledWith("/local/My.jar", "plugins/My.jar");
    expect(calls).toEqual(["connect", "mkdir", "put", "end"]);
  });

  it("still calls end() when put throws", async () => {
    const fake = {
      connect: vi.fn(async () => {}), mkdir: vi.fn(async () => {}),
      put: vi.fn(async () => { throw new Error("boom"); }), end: vi.fn(async () => {}),
    };
    await expect(uploadFile({ host: "h", port: 1, username: "u", password: "p" }, "/l.jar", "plugins/l.jar", () => fake as any)).rejects.toThrow("boom");
    expect(fake.end).toHaveBeenCalled();
  });
});
