import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  createSupportEntitlement,
  generateLicenseSigningKeyPair,
  publicKeyFingerprint,
  signSupportEntitlement,
} from "../src/license-keys.js";

const { values } = parseArgs({
  options: {
    "generate-keypair": { type: "boolean", default: false },
    "output-dir": { type: "string" },
    "private-key": { type: "string" },
    organization: { type: "string" },
    tier: { type: "string" },
    seats: { type: "string" },
    "expires-at": { type: "string" },
    "not-before": { type: "string" },
    features: { type: "string" },
    output: { type: "string" },
  },
  allowPositionals: false,
});

function fail(message: string): never {
  console.error(`OpenFieldPro key generation failed: ${message}`);
  process.exit(1);
}

function ensurePrivatePermissions(path: string) {
  if (process.platform === "win32") return;
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    fail(`private key ${path} is readable by group or other users; run chmod 600 ${path}`);
  }
}

if (values["generate-keypair"]) {
  const outputDir = resolve(values["output-dir"] ?? ".secrets/license");
  const privatePath = resolve(outputDir, "ofp-license-private.pem");
  const publicPath = resolve(outputDir, "ofp-license-public.pem");
  if (existsSync(privatePath) || existsSync(publicPath)) {
    fail(`refusing to overwrite an existing keypair in ${outputDir}`);
  }

  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const pair = generateLicenseSigningKeyPair();
  writeFileSync(privatePath, pair.privateKey, { mode: 0o600, flag: "wx" });
  writeFileSync(publicPath, pair.publicKey, { mode: 0o644, flag: "wx" });
  console.error(`Private key written to ${privatePath}`);
  console.error(`Public key written to ${publicPath}`);
  console.error(`Public key fingerprint: ${publicKeyFingerprint(pair.publicKey)}`);
  console.error("Back up the private key offline. Never commit or paste it into CI logs.");
  process.exit(0);
}

const privateKeyPath = values["private-key"] ?? process.env.OFP_LICENSE_PRIVATE_KEY_PATH;
if (!privateKeyPath) fail("provide --private-key or OFP_LICENSE_PRIVATE_KEY_PATH");
if (!values.organization) fail("provide --organization");

const resolvedPrivateKeyPath = resolve(privateKeyPath);
if (!existsSync(resolvedPrivateKeyPath)) fail(`private key not found: ${resolvedPrivateKeyPath}`);
ensurePrivatePermissions(resolvedPrivateKeyPath);

const seats = values.seats ? Number(values.seats) : 1;
if (!Number.isInteger(seats) || seats <= 0) fail("--seats must be a positive integer");
const tier = values.tier ?? "supporter";
if (!(["supporter", "business", "partner"] as const).includes(tier as "supporter" | "business" | "partner")) {
  fail("--tier must be supporter, business, or partner");
}

const privateKey = readFileSync(resolvedPrivateKeyPath, "utf8");
const payload = createSupportEntitlement({
  organization: values.organization,
  tier: tier as "supporter" | "business" | "partner",
  seats,
  ...(values["expires-at"] ? { expiresAt: values["expires-at"] } : {}),
  ...(values["not-before"] ? { notBefore: values["not-before"] } : {}),
  features: values.features
    ? values.features.split(",").map((feature) => feature.trim()).filter(Boolean)
    : [],
});
const token = signSupportEntitlement(payload, privateKey);

if (values.output) {
  const outputPath = resolve(values.output);
  if (existsSync(outputPath)) fail(`refusing to overwrite existing output: ${outputPath}`);
  writeFileSync(outputPath, `${token}\n`, { mode: 0o600, flag: "wx" });
  console.error(`Signed entitlement written to ${outputPath}`);
} else {
  process.stdout.write(`${token}\n`);
}
console.error(`License ID: ${payload.licenseId}`);
console.error(`Organization: ${payload.organization}`);
console.error(`Tier: ${payload.tier}; seats: ${payload.seats}`);
