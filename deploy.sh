#!/bin/bash

set -e

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

echo "Building Next.js..."

npm run build

#########################
# ZIP .next
#########################

echo "Creating zip..."

rm -f .next.zip

zip -r .next.zip .next

#########################
# PUSH CODE
#########################

echo ""
echo "Push your code to GitHub before continuing."
read -p "Press ENTER after git push..."

#########################
# UPLOAD .next
#########################

echo "Uploading build..."

scp -P $SERVER_PORT .next.zip ${SERVER_USER}@${SERVER_IP}:${REMOTE_PROJECT}/

#########################
# DEPLOY
#########################

echo "Deploying..."

ssh -p $SERVER_PORT ${SERVER_USER}@${SERVER_IP} << EOF

cd ${REMOTE_PROJECT}

echo "Pulling latest code..."
git pull

echo "Extracting build..."
unzip -o .next.zip

rm .next.zip

if pm2 describe ${PM2_NAME} > /dev/null
then
    echo "Restarting PM2..."
    pm2 restart ${PM2_NAME}
else
    echo "Starting PM2..."
    pm2 start npm --name ${PM2_NAME} -- start
fi

pm2 save

EOF

rm .next.zip

echo ""
echo "Deployment completed successfully."