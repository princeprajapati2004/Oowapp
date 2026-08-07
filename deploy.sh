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
echo "Building Next.js..."
echo "========================================"

npm run build

########################################
# ZIP .next
########################################

echo ""
echo "Creating .next.zip..."

rm -f .next.zip
zip -rq .next.zip .next

########################################
# GIT PUSH
########################################

echo ""
echo "Push your latest code to GitHub."
read -p "Press ENTER after git push..."

########################################
# UPLOAD BUILD
########################################

echo ""
echo "Uploading .next.zip..."

scp -P "$SERVER_PORT" .next.zip "${SERVER_USER}@${SERVER_IP}:${REMOTE_PROJECT}/"

########################################
# DEPLOY
########################################

echo ""
echo "Deploying..."

ssh -t -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_IP}" <<'EOF'

set -euo pipefail

REMOTE_PROJECT="$HOME/Oowapp"
PM2_NAME="oowapp"

cd "$REMOTE_PROJECT"

echo ""
echo "Current directory:"
pwd

echo ""
echo "Pulling latest code..."
git pull

echo ""
echo "Extracting .next..."
unzip -oq .next.zip

rm -f .next.zip

########################################
# Locate PM2 automatically
########################################

NVM_DIR="$HOME/.nvm"

PM2_BIN=$(find "$NVM_DIR/versions/node" -type f -name pm2 2>/dev/null | sort | tail -n1)

if [ -z "$PM2_BIN" ]; then
    echo ""
    echo "ERROR: Could not locate PM2."
    exit 1
fi

echo ""
echo "Using PM2:"
echo "$PM2_BIN"

########################################
# Restart / Start
########################################

if "$PM2_BIN" describe "$PM2_NAME" >/dev/null 2>&1; then
    echo ""
    echo "Restarting PM2..."
    "$PM2_BIN" restart "$PM2_NAME"
else
    echo ""
    echo "Starting PM2..."
    "$PM2_BIN" start npm --name "$PM2_NAME" -- start
fi

"$PM2_BIN" save

echo ""
echo "Deployment completed successfully."

EOF

########################################
# CLEANUP
########################################

rm -f .next.zip

echo ""
echo "========================================"
echo "Deployment Successful!"
echo "========================================"
