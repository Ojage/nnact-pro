# Signing Key Management

NnactPro includes Ed25519 tooling for optional, locally verified support-entitlement keys. These keys can represent sponsor recognition, support benefits, or premium plugin access. They are **never required to run the AGPL-licensed core** and must never gate user counts, job counts, CRM, scheduling, dispatch, work orders, estimates, invoices, payments, self-hosting, or other core field-service parity.

Verification is fully offline. NnactPro must not contact a license server, phone home, transmit usage, or require telemetry to validate a key.

## Threat model

The private signing key can mint valid entitlements. Compromise allows forged sponsor/support records. The public key verifies signatures and is safe to distribute.

Primary controls:

- Generate keys on an administrator-controlled offline or hardened machine.
- Keep the private key at `~/.ofp/license-signing-key.pem` unless a separately secured path is explicitly supplied.
- Never provide the private key to NnactPro application runtimes, CI, hosted deployments, customers, or support tools.
- Restrict private-key files to the owning user.
- Store encrypted offline backups in separate locations.
- Distribute only the public key to verification environments.
- Issue expiring keys for time-bounded benefits.
- Record license ID, organization, tier, issue date, expiration, signer, public-key fingerprint, and revocation status in an administrative ledger.

## Generate a keypair

From the repository root:

```bash
pnpm --filter @ofp/api license:keypair
```

The default command creates:

- `~/.ofp/license-signing-key.pem` with mode `0600`
- `~/.ofp/license-signing-public.pem` with mode `0644`

A custom directory can be selected with `--output-dir`. The command refuses to overwrite existing keys and prints the SHA-256 public-key fingerprint.

Verify file permissions on Unix-like systems:

```bash
stat -c '%a %n' ~/.ofp/license-signing-key.pem
# expected: 600
```

Never paste the private PEM into an issue, pull request, chat, ticket, build log, environment variable, password manager note shared with application operators, or source repository.

## Back up the private key

Maintain at least two encrypted copies in separate locations:

1. Primary encrypted secret storage or encrypted removable media
2. Offline recovery copy controlled by a second authorized custodian

Record the public fingerprint with each backup. Perform a recovery test using a non-production entitlement before relying on the backup.

## Generate a signed entitlement

The generator automatically uses `~/.ofp/license-signing-key.pem`:

```bash
pnpm --filter @ofp/api license:generate -- \
  --organization 'Example Service Company' \
  --tier business \
  --seats 15 \
  --expires-at '2027-12-31T23:59:59.000Z' \
  --features 'priority-support,sponsor-recognition' \
  --output ~/.ofp/example-service-company.ofp-license
```

A different private key can be supplied with `--private-key` or `NNPLICENSE_PRIVATE_KEY_PATH` for a controlled signing session.

Supported entitlement tiers are `supporter`, `business`, and `partner`. Tier names are administrative metadata; they do not alter AGPL rights. The generator:

- Refuses group/world-readable private-key files on Unix-like systems
- Refuses to overwrite existing keys or entitlement files
- Never prints the private key
- Validates date ordering and seat count
- Generates a random license UUID
- Signs the canonical payload with Ed25519

Token format:

```text
ofp1.<base64url-payload>.<base64url-ed25519-signature>
```

The entitlement file is bearer metadata. It is not equivalent to the private signing key, but it should be distributed only to the intended recipient.

## Verify a key locally

The verifier automatically uses `~/.ofp/license-signing-public.pem`:

```bash
pnpm --filter @ofp/api license:verify -- \
  --license-file ~/.ofp/example-service-company.ofp-license
```

Successful verification prints the signed payload and public-key fingerprint. Verification fails closed for:

- Incorrect token format
- Invalid JSON or schema
- Signature tampering
- Wrong public key
- Future issue date beyond clock tolerance
- Not-yet-active key
- Invalid expiration ordering
- Expired key

Do not trust decoded payload fields before signature and time checks pass.

## Deployment verification without phone-home

A deployment that uses an optional entitlement receives only the public key and entitlement token:

```bash
export NNPLICENSE_PUBLIC_KEY_PATH=/run/secrets/license-signing-public.pem
export NNPLICENSE_KEY='ofp1...'
pnpm --filter @ofp/api license:verify
```

Verification occurs locally. No request is sent to NnactPro, the project owner, a payment processor, or any license server. Do not place the private signing key in the runtime.

## What keys may and may not control

Permitted optional benefits:

- Sponsor recognition
- Clearly bounded support hours or response targets
- Premium first-party plugins such as future accounting or automation connectors
- Early release-candidate access
- Business deployment assistance

Prohibited key gates:

- Number of users, technicians, customers, jobs, invoices, or locations
- Core CRM, scheduling, dispatch, estimates, invoicing, payments, reporting, mobile field workflow, data export, or self-hosting
- Security fixes
- AGPL source availability or modification rights
- Local operation of the free core

## Rotation

Rotate a signing key when it may have been exposed, an authorized signer leaves, cryptographic policy changes, or the planned rotation interval is reached.

1. Generate a new keypair.
2. Record old and new public fingerprints.
3. Distribute the new public key to optional entitlement verifiers.
4. Reissue active entitlements with the new key.
5. Maintain the old public key only for a documented transition window.
6. Revoke the old fingerprint after transition.
7. Securely destroy active copies of the old private key while retaining only any legally required encrypted archive.

## Revocation

A signature proves authenticity, not current business standing. Maintain a private administrative revocation ledger keyed by `licenseId` and public-key fingerprint. Offline deployments cannot receive live revocation without phone-home; use short expiration windows for benefits requiring frequent renewal.

Revocation must affect only optional sponsor/support/plugin benefits. It must never disable or degrade the AGPL core.

## Verification evidence

The API test suite covers matching-key verification, tampering, wrong public keys, expiration, activation windows, and invalid date ordering. The release smoke test also generates a real keypair, signs a token, verifies it, and confirms private-file mode `0600`.

```bash
pnpm --filter @ofp/api test
```
