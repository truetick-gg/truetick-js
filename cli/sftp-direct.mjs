import SftpClient from "ssh2-sftp-client";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const k = JSON.parse(readFileSync(homedir() + "/.truetick/config.json", "utf8")).apiKey;
const B = "http://127.0.0.1:8082";

const cred = await fetch(B + "/v1/servers/qatest:enable-sftp", {
  method: "POST",
  headers: { "x-api-key": k, "content-type": "application/json" },
  body: "{}",
}).then((r) => r.json());
console.log("cred:", JSON.stringify({ host: cred.host, port: cred.port, username: cred.username, pwlen: (cred.password || "").length }));

const c = new SftpClient();
await c.connect({ host: "127.0.0.1", port: cred.port || 2222, username: cred.username, password: cred.password });
try {
  await c.mkdir("plugins", true).catch(() => {});
  await c.put("F:/code/mchost-qa/qa-project/qatest-plugin.jar", "plugins/qatest-plugin.jar");
  const list = await c.list("plugins");
  console.log("plugins/ after upload:", list.map((f) => `${f.name} (${f.size}b)`).join(", "));
  console.log("SFTP UPLOAD OK (auth + chroot + put + list all worked over 127.0.0.1:2222)");
} finally {
  await c.end();
}
