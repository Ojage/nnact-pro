# Signing Key Management

OpenFieldPro includes Ed25519 tooling for optional signed support-entitlement keys. These keys can represent sponsor/support benefits, service levels, or deployment metadata. They are **not required to run the AGPL-licensed core** and must never be used to remove rights granted by `LICENSE`.

## Threat model

The private signing key can mint valid entitlements. Compromise allows forged sponsor/support records. The public key verifies signatures and is safe to distribute.

Primary controls:

- Generate signing keys on an administrator-controlled machine.
- Keep private keys outside the repository and CI logs.
- Restrict private-key files to the owning user.
- Store an encrypted offline backup.
- Distribute only public keys to verification environments.
- Issue expiring keys for benefits that are time-bounded.
- Record license ID, organization, tier, issue date, expiration, signer, and revocation status in an administrative ledger.

## Generate a keypair

From the repository root:

```bash
pnpm --filter @ofp/api license:keypair -- --output-dir .secrets/license
```

The command creates:

- `.secrets/license/ofp-license-private.pem` with mode `0600`
- `.secrets/license/ofp-license-public.pem` with mode `0644`

The command refuses to overwrite existing keys and prints the SHA-256 public-key fingerprint. `.secrets/` is ignored by Git.

Verify file permissions on Unix-like systems:

```bash
stat -c '%a %n' .secrets/license/ofp-license-private.pem
# expected: 600
```

Never paste the private PEM into an issue, pull request, chat, ticket, build log, or environment variable visible to application processes.

## Back up the private key

Maintain at least two encrypted copies in separate locations:

1. Primary secret manager or encrypted removable media
2. Offline recovery copy controlled by a second authorized custodian

Record the public fingerprint with the backup. Perform a recovery test using a non-production entitlement before relying on the backup.

## Generate a signed entitlement

```bash
pnpm --filter @ofp/api license:generate -- \
  --private-key .secrets/license/ofp-license-private.pem \
  --organization 'Example Service Company' \
  --tier business \
  --seats 15 \
  --expires-at '2027-12-31T23:59:59.000Z' \
  --features 'priority-support,sponsor-recognition' \
  --output .secrets/example-service-company.ofp-license
```

Supported tiers are `supporter`, `business`, and `partner`. The generator:

- Refuses group/world-readable private-key files on Unix-like systems
- Refuses to overwrite an existing output
- Never prints the private key
- Validates date ordering and seat count
- Generates a random license UUID
- Signs the canonical payload with Ed25519

The token format is:

```text
ofp1.<base64url-payload>.<base64url-ed25519-signature>
```

The entitlement file is bearer metadata. It is not equivalent to the private signing key, but it should still be distributed only to the intended recipient.

## Verify a key

```bash
pnpm --filter @ofp/api license:verify -- \
  --public-key .secrets/license/ofp-license-public.pem \
  --license-file .secrets/example-service-company.ofp-license
```

Successful verification prints the payload and the public-key fingerprint. Verification fails closed for:

- Incorrect token format
- Invalid JSON or schema
- Signature tampering
- Wrong public key
- Future issue date beyond clock tolerance
- Not-yet-active key
- Invalid expiration ordering
- Expired key

Verification must happen before any optional sponsor/support benefit is granted. Do not trust decoded payload fields before the signature and time checks pass.

## Environment-based verification

Production verifiers may use:

```bash
export OFP_LICENSE_PUBLIC_KEY_PATH=/run/secrets/ofp-license-public.pem
export OFP_LICENSE_KEY='ofp1...'
pnpm --filter @ofp/api license:verify
```

Do not provide the private signing key to the application runtime. Signing and verification should be separated operationally.

## Rotation

Rotate a signing key when:

- The private key may have been exposed
- An authorized signer leaves
- The cryptographic policy changes
- The key reaches the organization's planned rotation interval

Rotation procedure:

1. Generate a new keypair.
2. Record both old and new public fingerprints.
3. Deploy the new public key to verifiers.
4. Reissue active entitlements with the new key.
5. Maintain the old public key only for the documented transition window.
6. Revoke the old fingerprint after the transition.
7. Securely destroy active copies of the old private key while retaining any legally required encrypted archive.

A future multi-key verifier should identify accepted keys by fingerprint. Until then, rotation requires a coordinated public-key deployment.

## Revocation

A valid signature does not prove that an entitlement has not been revoked. Maintain a revocation ledger keyed by `licenseId` and public-key fingerprint. Check that ledger before granting a service benefit when online verification is available.

Document the reason, approver, and effective time for every revocation. Do not silently alter signed payloads.

## CI verification

The API test suite covers:

- Matching-key verification
- Payload tampering
- Wrong public key
- Expired keys
- Not-yet-active keys
- Invalid expiration ordering

Run:

```bash
pnpm --filter @ofp/api test
```

The repository release-safety job also checks that private-key material is not tracked and that the generation/verification tooling and documentation exist.
