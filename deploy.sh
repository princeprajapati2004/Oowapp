#!/bin/bash
# Deploy to production server.
# Make sure you have already done `git push` before running this.

set -euo pipefail

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use default --silent 2>/dev/null || true

SERVER_USER="oowapp_i1"
SERVER_IP="103.191.208.56"
SERVER_PORT="22"
REMOTE_DIR="~/Oowapp"

########################################
# 1. Build
########################################
echo "========================================"
echo " BUILD"
echo "========================================"
npm run build

########################################
# 2. Zip .next (everything, recursively)
########################################
echo ""
echo "[1/3] Zipping .next..."
rm -f .next.zip
zip -ry .next.zip .next   # -r = recursive, -y = store symlinks as symlinks
echo "      $(du -sh .next.zip | cut -f1)"

########################################
# 3. Upload
########################################
echo ""
echo "[2/3] Uploading to server..."
scp -P "$SERVER_PORT" .next.zip "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
scp -P "$SERVER_PORT" ecosystem.config.cjs "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
rm -f .next.zip
echo "      Done."

########################################
# 4. Remote deploy
########################################
echo ""
echo "[3/3] Deploying on server..."

ssh -t -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_IP}" bash <<'REMOTE'
set -euo pipefail
cd ~/Oowapp

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use default --silent 2>/dev/null || true

echo "  -> removing old .next..."
rm -rf .next

echo "  -> extracting new .next..."
unzip -oq .next.zip
rm -f .next.zip

echo "  -> git pull..."
git pull

echo "  -> npm install..."
npm install --omit=dev

echo "  -> applying database migrations..."
node scripts/db-deploy.mjs

echo "  -> starting/reloading app..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save --force

echo ""
echo "  Deployed successfully!"
REMOTE

echo ""
echo "========================================"
echo " Done! Site is live at oowapp.in"
echo "========================================"
