import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { verifySupportEntitlement } from "../src/license-keys.js";

const { values } = parseArgs({
  options: {
    "public-key": { type: "string" },
    license: { type: "string" },
    "license-file": { type: "string" },
  },
  allowPositionals: false,
});

function fail(message: string): never {
  console.error(`OpenFieldPro key verification failed: ${message}`);
  process.exit(1);
}

const publicKeyPath = values["public-key"] ?? process.env.OFP_LICENSE_PUBLIC_KEY_PATH;
if (!publicKeyPath) fail("provide --public-key or OFP_LICENSE_PUBLIC_KEY_PATH");
const resolvedPublicKeyPath = resolve(publicKeyPath);
if (!existsSync(resolvedPublicKeyPath)) fail(`public key not found: ${resolvedPublicKeyPath}`);

let token = values.license ?? process.env.OFP_LICENSE_KEY;
if (values["license-file"]) {
  const licensePath = resolve(values["license-file"]);
  if (!existsSync(licensePath)) fail(`license file not found: ${licensePath}`);
  token = readFileSync(licensePath, "utf8").trim();
}
if (!token) fail("provide --license, --license-file, or OFP_LICENSE_KEY");

const publicKey = readFileSync(resolvedPublicKeyPath, "utf8");
const result = verifySupportEntitlement(token, publicKey);
if (!result.valid) fail(`${result.reason}${result.keyFingerprint ? ` (key ${result.keyFingerprint})` : ""}`);

process.stdout.write(`${JSON.stringify({
  valid: true,
  keyFingerprint: result.keyFingerprint,
  payload: result.payload,
}, null, 2)}\n`);
