#!/bin/bash

set -euo pipefail

########################################
# CONFIGURATION
########################################

SERVER_USER="oowapp_i1"
SERVER_IP="103.191.208.56"
SERVER_PORT="22"
REMOTE_PROJECT="~/Oowapp"
PM2_NAME="oowapp"

########################################
# BUILD
########################################

echo "========================================"
echo " BUILD"
echo "========================================"
npm run build

########################################
# ZIP .next
########################################

echo ""
echo "[1/4] Creating .next.zip..."
rm -f .next.zip
zip -rq .next.zip .next
echo "      Done ($(du -sh .next.zip | cut -f1))"

########################################
# UPLOAD
########################################

echo ""
echo "[2/4] Uploading .next.zip to server..."
scp -P "$SERVER_PORT" .next.zip "${SERVER_USER}@${SERVER_IP}:${REMOTE_PROJECT}/"
rm -f .next.zip
echo "      Uploaded."

########################################
# GIT PUSH — user confirms before we pull on server
########################################

echo ""
echo "[3/4] Push your latest code to GitHub now."
read -rp "      Press ENTER after git push is done..."

########################################
# REMOTE DEPLOY
########################################

echo ""
echo "[4/4] Deploying on server..."

ssh -t -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_IP}" bash <<'REMOTE'
set -euo pipefail

REMOTE_PROJECT="$HOME/Oowapp"
PM2_NAME="oowapp"

cd "$REMOTE_PROJECT"

echo "  -> git pull"
git pull

echo "  -> extracting .next..."
unzip -oq .next.zip
rm -f .next.zip

# Locate PM2 under nvm
NVM_DIR="$HOME/.nvm"
PM2_BIN=$(find "$NVM_DIR/versions/node" -type f -name pm2 2>/dev/null | sort | tail -n1)

if [ -z "$PM2_BIN" ]; then
  # Fall back to PATH
  PM2_BIN=$(command -v pm2 2>/dev/null || true)
fi

if [ -z "$PM2_BIN" ]; then
  echo "ERROR: pm2 not found." >&2
  exit 1
fi

echo "  -> pm2 at $PM2_BIN"

if "$PM2_BIN" describe "$PM2_NAME" >/dev/null 2>&1; then
  echo "  -> restarting $PM2_NAME"
  "$PM2_BIN" restart "$PM2_NAME"
else
  echo "  -> starting $PM2_NAME"
  "$PM2_BIN" start npm --name "$PM2_NAME" -- start
fi

"$PM2_BIN" save --force
REMOTE

########################################
# DONE
########################################

echo ""
echo "========================================"
echo " Deployment complete!"
echo "========================================"
