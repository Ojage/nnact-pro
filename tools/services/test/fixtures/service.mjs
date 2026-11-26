// A stand-in service: listens on PORT, keeps a grandchild process in its
// group (as pnpm and tsx do), and prints things that must be redacted.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

// The grandchild ignores SIGTERM, so only a group-wide SIGKILL removes it.
const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1e6)"], {
  stdio: "ignore",
});
if (process.env.GRANDCHILD_FILE) writeFileSync(process.env.GRANDCHILD_FILE, String(grandchild.pid));

console.log(`ready with token ${process.env.SECRET_TOKEN}`);
console.log("Authorization: Bearer abcdefghijklmnopqrstuv");
console.error("db password=hunter22-secret at postgres://app:pa55word@localhost:5432/db");
console.log("customer +237612345678 wrote from amina@example.com");
const flood = Number(process.env.FLOOD_LINES ?? 0);
for (let index = 0; index < flood; index += 1) console.log(`line ${index} ${"x".repeat(80)}`);

createServer((_request, response) => response.end("ok")).listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => {
  if (process.env.IGNORE_TERM !== "1") process.exit(0);
});
