#!/usr/bin/env bash
# One-time VPS bootstrap for NNACT Pro (shared-host friendly: /srv/nnact-pro).
# Run as root: bash scripts/vps-bootstrap.sh
set -euo pipefail

APP_USER="${APP_USER:-nnact}"
APP_DIR="${APP_DIR:-/srv/nnact-pro}"
REPO_URL="${REPO_URL:-git@github.com:Ojage/nnact-pro.git}"
DEPLOY_PUB_KEY_FILE="${DEPLOY_PUB_KEY_FILE:-}"
GITHUB_DEPLOY_KEY_FILE="${GITHUB_DEPLOY_KEY_FILE:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker before bootstrap." >&2
  exit 1
fi

if ! id "$APP_USER" &>/dev/null; then
  useradd --create-home --shell /bin/bash --user-group "$APP_USER"
fi

usermod -aG docker "$APP_USER"

install -d -m 755 /srv
install -d -m 755 "$APP_DIR"
install -d -m 755 "$APP_DIR/data/pg" "$APP_DIR/data/redis" "$APP_DIR/data/uploads"

if [ -n "$DEPLOY_PUB_KEY_FILE" ] && [ -f "$DEPLOY_PUB_KEY_FILE" ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" "$DEPLOY_PUB_KEY_FILE" "/home/$APP_USER/.ssh/authorized_keys"
elif [ -n "${DEPLOY_PUB_KEY:-}" ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  printf '%s\n' "$DEPLOY_PUB_KEY" > "/home/$APP_USER/.ssh/authorized_keys"
  chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
  chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
fi

if [ -n "$GITHUB_DEPLOY_KEY_FILE" ] && [ -f "$GITHUB_DEPLOY_KEY_FILE" ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" "$GITHUB_DEPLOY_KEY_FILE" "/home/$APP_USER/.ssh/id_ed25519_github"
  if ! grep -q github.com "/home/$APP_USER/.ssh/config" 2>/dev/null; then
    cat >> "/home/$APP_USER/.ssh/config" <<'SSHCFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
SSHCFG
    chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/config"
    chmod 600 "/home/$APP_USER/.ssh/config"
  fi
  ssh-keyscan -H github.com >> "/home/$APP_USER/.ssh/known_hosts" 2>/dev/null || true
  chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/known_hosts"
  chmod 644 "/home/$APP_USER/.ssh/known_hosts"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
  echo "Repository already present at $APP_DIR"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

cat <<EOF
Bootstrap complete.
  App user:  $APP_USER
  App path:  $APP_DIR
  Next: set GitHub secrets and push to main (deploy workflow), or run scripts/ci-deploy.sh on the server.
EOF
