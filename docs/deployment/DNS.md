# DNS for nnact.com (Namecheap)

VPS IP: **169.58.213.92**

In Namecheap **Advanced DNS**, the **Host** column is only the part *before* `.nnact.com`.

| Host | Type | Value | Result |
|------|------|-------|--------|
| `@` | A Record | `169.58.213.92` | `nnact.com` (marketing site) |
| `www` | A Record | `169.58.213.92` | `www.nnact.com` (redirects to apex via Caddy) |
| `pro` | A Record | `169.58.213.92` | `pro.nnact.com` (NNACT Pro web app) |
| `api.pro` | A Record | `169.58.213.92` | `api.pro.nnact.com` (NNACT Pro API) |

## Remove conflicting records first

Delete or replace these defaults if still present:

- **URL Redirect** — Host `@` → `http://www.nnact.com/` (blocks apex A record)
- **CNAME** — Host `www` → `parkingpage.namecheap.com` (replace with A record above)

Keep existing **TXT** records (SPF, Google verification, etc.) unless they conflict.

## Common mistakes

| Wrong Host | Creates | Use instead |
|------------|---------|-------------|
| `pro.nnact` | `pro.nnact.nnact.com` | `pro` |
| `api` | `api.nnact.com` | `api.pro` |
| `pro.nnact.com` | invalid / wrong | `pro` |

## Verify (after 5–30 minutes)

```bash
dig +short pro.nnact.com
dig +short api.pro.nnact.com
dig +short nnact.com
dig +short www.nnact.com
```

All should return `169.58.213.92`.
