# OpenFieldPro Self-Hosting Operations

This guide covers the first production-grade operator tasks for a self-hosted OpenFieldPro install.

## Install

```bash
scripts/install.sh
```

The script creates `.env` if needed, detects Podman or Docker, builds the production stack, and starts Caddy, web, API, worker, Postgres, Redis, and MinIO.

## Update

```bash
scripts/update.sh
```

The script pulls the latest code, rebuilds containers, and restarts the production stack.

## Backup

```bash
scripts/backup.sh
```

Backups are written to `backups/YYYYMMDD-HHMMSS/` and include:

- `ofp.sql` PostgreSQL dump
- MinIO data archive if present
- `.env.copy` if present

## Restore

```bash
scripts/restore.sh backups/YYYYMMDD-HHMMSS
```

Restore drops and recreates the public schema, imports the SQL dump, restores MinIO data if present, and restarts the stack.

## Health checks

- App: `http://localhost:8080`
- Landing: `http://localhost:8080/welcome`
- API: `http://localhost:8080/api/health`

## Production checklist

Before public deployment:

- Replace `JWT_SECRET` with a strong secret.
- Replace `POSTGRES_PASSWORD`.
- Point Caddy at a real domain.
- Configure Stripe secrets only if online card payments are enabled.
- Schedule recurring backups.
- Test restore on a separate machine or VM.
- Keep sponsor config local, labeled, and free of tracking scripts.
