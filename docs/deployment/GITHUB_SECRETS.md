# GitHub Actions secrets (production VPS)

Set these on **both** repositories:

- [Ojage/nnact-pro](https://github.com/Ojage/nnact-pro) — full stack deploy
- [Ojage/nnact-webapp](https://github.com/Ojage/nnact-webapp) — marketing site only

## Repository secrets

| Secret | Example | Purpose |
|--------|---------|---------|
| `DEPLOY_HOST` | `169.58.213.92` | VPS IP or hostname |
| `DEPLOY_USER` | `nnact` | SSH user |
| `DEPLOY_SSH_KEY` | *(private key)* | Deploy key (same as VPS `authorized_keys`) |
| `DEPLOY_PATH` | `/srv/nnact-pro` | Path to nnact-pro on the server |

## nnact-pro only

| Secret | Purpose |
|--------|---------|
| `NNACT_PRO_ENV` | Full contents of production `.env` — copy from `infra/production.env.example` and fill secrets |

Minimum `NNACT_PRO_ENV` domain lines:

```env
NNPSITE_ADDRESS=pro.nnact.com
NNPAPI_ADDRESS=api.pro.nnact.com
NNPMARKETING_ADDRESS=nnact.com
NNPMARKETING_WWW=www.nnact.com
NNPMARKETING_ROOT=/srv/nnact-pro/data/marketing/dist
PUBLIC_WEB_URL=https://pro.nnact.com
PUBLIC_API_URL=https://api.pro.nnact.com
CORS_ORIGIN=https://pro.nnact.com
```

## Workflows

| Repo | Workflow | Trigger |
|------|----------|---------|
| nnact-pro | `.github/workflows/deploy-production.yml` | Push to `main` → full deploy + marketing rebuild |
| nnact-webapp | `.github/workflows/deploy-production.yml` | Push to `main` → marketing rebuild only |
| nnact-webapp | `.github/workflows/ci.yml` | Push / PR → `npm ci` + `npm run build` |

## One-time VPS setup

```bash
sudo bash scripts/vps-bootstrap.sh   # as root, once
# Copy infra/production.env.example → /srv/nnact-pro/.env and set secrets
bash scripts/ci-deploy.sh          # first full deploy
```
