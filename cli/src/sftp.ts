import { posix } from "node:path";
import SftpClient from "ssh2-sftp-client";
import type { SftpCredential } from "@truetick/sdk";

export interface SftpClientLike {
  connect(opts: { host: string; port: number; username: string; password: string }): Promise<unknown>;
  mkdir(dir: string, recursive?: boolean): Promise<unknown>;
  put(local: string, remote: string): Promise<unknown>;
  end(): Promise<unknown>;
}

// uploadFile streams a (binary) local file to remotePath over SFTP, ensuring the
// remote directory exists. factory is injectable for tests.
export async function uploadFile(
  cred: SftpCredential,
  localPath: string,
  remotePath: string,
  factory: () => SftpClientLike = () => new SftpClient() as unknown as SftpClientLike,
): Promise<void> {
  const client = factory();
  await client.connect({ host: cred.host, port: cred.port, username: cred.username, password: cred.password });
  try {
    const dir = posix.dirname(remotePath);
    if (dir && dir !== "." && dir !== "/") await client.mkdir(dir, true);
    await client.put(localPath, remotePath);
  } finally {
    await client.end();
  }
}
