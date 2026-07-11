# OpenFieldPro Release Checklist

A release is ready only when every required gate below is complete and evidence is attached to the release or pull request. A green build alone is insufficient.

## 1. Scope and version

- [ ] Release scope is written in user-facing terms.
- [ ] Breaking changes and migration requirements are identified.
- [ ] Version and release tag are selected.
- [ ] Deferred defects have owners and documented impact.
- [ ] No feature is described as complete when its production dependency is still mocked or optional.

## 2. Source integrity

```bash
pnpm install --frozen-lockfile
pnpm release:safety
pnpm audit --prod --audit-level=high
```

- [ ] Lockfile is committed and installs with `--frozen-lockfile`.
- [ ] Repository secret scan passes.
- [ ] No `.env`, private PEM, signing key, live payment key, cloud access key, database export, or customer data is tracked.
- [ ] Dependency audit has no unaccepted high/critical production vulnerability.
- [ ] Every accepted exception has a written rationale, compensating control, owner, and expiration date.
- [ ] AGPL license and third-party notices are present.

## 3. Automated validation

```bash
pnpm --filter @ofp/db generate
pnpm --filter @ofp/api build
pnpm --filter @ofp/api test
pnpm --filter @ofp/web test:unit
pnpm --filter @ofp/web build
pnpm --filter @ofp/web test:e2e
pnpm --filter @ofp/mobile typecheck
```

- [ ] Database schema generation passes.
- [ ] API compiles and all tests pass.
- [ ] Web unit tests pass.
- [ ] Next.js production build passes.
- [ ] Chromium operations tests pass with no console or page errors.
- [ ] Technician mobile app type-checks.
- [ ] Desktop and mobile screenshots are inspected by a human.
- [ ] Browser tests cover the release's changed primary workflows.

## 4. Lead-to-payment workflow

Test with a clean organization and realistic non-production data:

- [ ] Create a new customer during job intake.
- [ ] Create a job for an existing customer.
- [ ] Create both scheduled and unscheduled work.
- [ ] Assign an owner or technician.
- [ ] Confirm overlapping appointments are rejected.
- [ ] Start a scheduled job.
- [ ] Complete an in-progress job.
- [ ] Add billable line items and verify job total.
- [ ] Confirm a zero-dollar job cannot be invoiced.
- [ ] Confirm a job cannot receive a duplicate active invoice.
- [ ] Create an invoice from the closeout queue.
- [ ] Send or mark the invoice according to the configured workflow.
- [ ] Record a partial payment.
- [ ] Record the final payment and confirm paid status.
- [ ] Verify activity history, reporting, search, and mobile sync reflect the same state.

## 5. Authentication and authorization

- [ ] `NODE_ENV=production` is set.
- [ ] `JWT_SECRET` is unique, at least 32 characters, and stored in a secret manager.
- [ ] Startup fails with a missing/default production JWT secret.
- [ ] Role boundaries are tested for owner, admin/dispatcher, technician, and office roles.
- [ ] Organization scoping is verified for reads and writes.
- [ ] Disabled users cannot authenticate or retain active access.
- [ ] Admin and signing-key operations are audited.

## 6. Network and application security

- [ ] `CORS_ORIGIN` lists only intended HTTPS origins.
- [ ] Wildcard production CORS is rejected.
- [ ] TLS terminates at a trusted proxy or load balancer.
- [ ] API, database, Redis, and object storage are not publicly exposed unless explicitly required and protected.
- [ ] Rate limits are configured for authentication, public booking, uploads, checkout, and other abuse-prone endpoints.
- [ ] Upload size, MIME type, and storage permissions are validated.
- [ ] Security headers and proxy forwarding are reviewed.
- [ ] Logs redact authorization headers, cookies, tokens, payment secrets, and customer-sensitive payloads.

## 7. Payments

When Stripe is disabled:

- [ ] Manual/offline payment flow works without Stripe configuration.
- [ ] UI clearly distinguishes manually recorded payment from online card collection.

When Stripe is enabled:

- [ ] Live and test credentials are stored separately.
- [ ] Webhook signature verification is enabled with the correct environment secret.
- [ ] Success and cancel URLs point to the production web origin, not the API origin.
- [ ] Duplicate webhook delivery is idempotent.
- [ ] Partial, full, duplicate, overpayment, void, and refund behavior is tested.
- [ ] No raw card number or CVC passes through OpenFieldPro servers.

## 8. Data protection

- [ ] Data retention and deletion policy is documented.
- [ ] Customer export and deletion procedures are tested.
- [ ] Database backups are encrypted.
- [ ] Object-storage backups include photos and documents.
- [ ] Restore drill completes in an isolated environment.
- [ ] Restore time and recovery point are recorded.
- [ ] Database migrations are tested against a production-sized copy with sensitive data removed.
- [ ] Rollback or forward-fix plan exists for every migration.

## 9. Infrastructure

- [ ] Compose/deployment configuration resolves successfully.
- [ ] Persistent volumes are explicit.
- [ ] Health checks exist for API, web, Postgres, Redis, and storage.
- [ ] Resource limits and restart policies are set.
- [ ] Time zone and clock synchronization are correct.
- [ ] Outbound email/SMS/payment/network dependencies are tested from the deployment environment.
- [ ] Monitoring covers availability, error rates, queue depth, storage, backups, and failed payments.
- [ ] Alert routing has a named owner.

## 10. Mobile and offline

- [ ] Test on at least one supported iOS device/simulator and Android device/emulator.
- [ ] Authentication persists and revokes correctly.
- [ ] Today's jobs and work-order details render on small screens.
- [ ] Offline changes queue without data loss.
- [ ] Reconnection sync is idempotent.
- [ ] Conflicting edits present a recoverable state.
- [ ] Photos and notes survive app termination during upload/sync.
- [ ] App version compatibility with the API is documented.

## 11. Accessibility and visual QA

- [ ] Keyboard-only navigation works for primary workflows.
- [ ] Current navigation item is announced.
- [ ] Dialog focus is trapped and restored.
- [ ] Form inputs have programmatic labels and actionable errors.
- [ ] Status is not conveyed by color alone.
- [ ] Desktop and 390px mobile layouts have no document-level horizontal overflow.
- [ ] Light and dark themes are inspected.
- [ ] Screenshots attached: intake, dispatch conflict, closeout, invoice/payment, desktop, and mobile.

## 12. Signing and entitlement keys

- [ ] Core AGPL operation does not require an entitlement key.
- [ ] Private signing key was generated outside the repository.
- [ ] Private key permissions are restricted and an encrypted offline backup exists.
- [ ] Public fingerprint is recorded.
- [ ] Key generation and verification tests pass.
- [ ] Tampered, wrong-key, future, and expired tokens fail verification.
- [ ] Revocation ledger and rotation owner are identified.
- [ ] No private key is present in application runtime or CI.

See `docs/security/KEY_MANAGEMENT.md`.

## 13. Sponsorship and public claims

- [ ] Sponsor profile statements are factual.
- [ ] Adoption metrics are measured or explicitly labeled estimates.
- [ ] Sponsorship benefits do not sell merge approval, undisclosed control, customer data, or security access.
- [ ] Sponsor recognition does not imply certification or endorsement.
- [ ] FUNDING links resolve.
- [ ] Use-of-funds reporting date is published.

See `docs/funding/SPONSORSHIP_PLAYBOOK.md`.

## 14. Release evidence

Attach or link:

- [ ] Commit SHA and signed/annotated tag
- [ ] CI run
- [ ] Dependency-audit result
- [ ] Migration result
- [ ] Backup and restore drill result
- [ ] Desktop/mobile visual artifact
- [ ] Known limitations
- [ ] Upgrade instructions
- [ ] Rollback/forward-fix plan
- [ ] Changelog and release notes

## 15. Go/no-go

A release is **no-go** when any of these is true:

- High/critical unaccepted production vulnerability
- Default or missing production secret
- Wildcard production CORS
- Failed backup restore
- Unreviewed destructive migration
- Lead-to-payment workflow failure
- Duplicate invoice/payment risk
- Lost offline changes
- Private key or customer data exposure
- Failed build, test, type-check, or required browser check

The release owner records the final decision, date, commit, evidence, accepted risks, and rollback owner.
