#!/bin/bash

set -euo pipefail

#########################
# CONFIGURATION
#########################

SERVER_USER="oowapp_i1"
SERVER_IP="103.191.208.56"
SERVER_PORT="22"

REMOTE_PROJECT="~/Oowapp"

PM2_NAME="oowapp"

#########################
# BUILD
#########################

echo "========================================="
echo "Building Next.js..."
echo "========================================="

npm run build

#########################
# ZIP .next
#########################

echo ""
echo "Creating .next.zip..."

rm -f .next.zip

zip -rq .next.zip .next

#########################
# PUSH CODE
#########################

echo ""
echo "Push your latest code to GitHub."
read -p "Press ENTER after git push..."

#########################
# UPLOAD BUILD
#########################

echo ""
echo "Uploading .next.zip..."

scp -P "$SERVER_PORT" .next.zip "${SERVER_USER}@${SERVER_IP}:${REMOTE_PROJECT}/"

#########################
# DEPLOY
#########################

echo ""
echo "Deploying on server..."

ssh -t -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_IP}" <<EOF

set -e

cd ${REMOTE_PROJECT}

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

###################################################
# Load shell environment
###################################################

[ -f ~/.bashrc ] && source ~/.bashrc
[ -f ~/.profile ] && source ~/.profile
[ -f ~/.bash_profile ] && source ~/.bash_profile

###################################################
# Verify pm2 exists
###################################################

if ! command -v pm2 >/dev/null 2>&1; then
    echo ""
    echo "ERROR: pm2 was not found."
    echo "Current PATH:"
    echo \$PATH
    echo ""
    echo "Run 'which pm2' after logging into the server manually."
    exit 1
fi

echo ""
echo "PM2 Location:"
command -v pm2

###################################################
# Restart / Start
###################################################

if pm2 describe ${PM2_NAME} >/dev/null 2>&1; then
    echo ""
    echo "Restarting PM2..."
    pm2 restart ${PM2_NAME}
else
    echo ""
    echo "Starting PM2..."
    pm2 start npm --name ${PM2_NAME} -- start
fi

pm2 save

echo ""
echo "Deployment finished."

EOF

#########################
# CLEANUP
#########################

rm -f .next.zip

echo ""
echo "========================================="
echo "Deployment completed successfully!"
echo "========================================="