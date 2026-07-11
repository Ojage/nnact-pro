# Security Policy

## Supported versions

OpenFieldPro is pre-1.0 software. Security fixes are applied to the latest release and the current default branch. Older commits and unmaintained forks are not supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

1. Open this repository's **Security** tab.
2. Choose **Advisories**.
3. Create a new private draft security advisory.
4. Include the affected commit or release, reproduction steps, impact, logs with secrets removed, and any proposed mitigation.

If private vulnerability reporting is not enabled, contact the repository owner privately through GitHub before sharing technical details. Never send production credentials, customer data, private signing keys, database exports, or unredacted payment information.

## Response targets

- Acknowledge a complete report within 3 business days.
- Triage severity and affected versions within 7 business days.
- Coordinate disclosure after a fix or mitigation is available.
- Credit reporters when requested and safe to do so.

These are response targets, not a warranty or service-level agreement.

## Security boundaries

A production deployment must:

- Set `NODE_ENV=production`.
- Use a unique `JWT_SECRET` of at least 32 characters.
- Set explicit HTTPS origins in `CORS_ORIGIN`; wildcard production CORS is rejected.
- Use unique database, object-storage, Redis, and payment credentials.
- Terminate TLS before the API and web applications.
- Restrict database, Redis, and object storage to private networks.
- Configure backups and complete a restore drill before serving customers.
- Verify Stripe webhook signatures when Stripe is enabled.
- Keep license/support-entitlement private signing keys offline and outside the repository.
- Run `pnpm release:safety` and the complete release checklist before publishing.

## Sensitive data

OpenFieldPro can contain customer contact information, addresses, equipment history, photos, notes, invoices, and payment metadata. Operators are responsible for access control, retention, deletion, backups, regional privacy requirements, breach notification, and vendor agreements.

OpenFieldPro does not store raw card data. Online card collection must remain on a PCI-capable payment provider's hosted surface.

## Signed entitlement keys

Signed support-entitlement keys are optional operational metadata for sponsor/support programs. They do not remove, narrow, or replace rights granted by the AGPL-3.0-only license, and the open-source core must not require a key to run.

See `docs/security/KEY_MANAGEMENT.md` for generation, custody, verification, rotation, and revocation procedures.
