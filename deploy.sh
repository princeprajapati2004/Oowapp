#!/bin/bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use default --silent 2>/dev/null || true

SERVER_USER="oowapp_i1"
SERVER_IP="103.191.208.56"
SERVER_PORT="22"
REMOTE_DIR="~/Oowapp"

SSH="ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_IP}"
SCP="scp -P $SERVER_PORT"

# ── 1. Clean build ────────────────────────────────────────────────────────────
echo "========================================"
echo " BUILD  (clean webpack)"
echo "========================================"
# Delete .next first so no dev/turbopack cache contaminates the production build
rm -rf .next
npm run build

# ── 2. Zip ────────────────────────────────────────────────────────────────────
echo ""
echo "[1/4] Zipping .next..."
rm -f .next.zip
zip -ry .next.zip .next
echo "      $(du -sh .next.zip | cut -f1)"

# ── 3. Upload ─────────────────────────────────────────────────────────────────
echo ""
echo "[2/4] Removing old .next.zip from server..."
$SSH "rm -f ${REMOTE_DIR}/.next.zip"

echo ""
echo "[3/4] Uploading .next.zip..."
$SCP .next.zip "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
rm -f .next.zip
echo "      Done."

# ── 4. Deploy on server ───────────────────────────────────────────────────────
echo ""
echo "[4/4] Deploying on server..."
$SSH bash -s << 'REMOTE'
  set -euo pipefail
  cd ~/Oowapp

  echo "  → Extracting .next..."
  rm -rf .next
  unzip -oq .next.zip
  rm .next.zip

  echo "  → Killing any rogue next-server on port 3000..."
  fuser -k 3000/tcp 2>/dev/null || true
  sleep 1

  echo "  → Starting PM2..."
  . ~/.nvm/nvm.sh
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save

  echo "  → Status:"
  pm2 list
REMOTE

echo ""
echo "========================================"
echo " Deploy complete. oowapp.in is live."
echo "========================================"
