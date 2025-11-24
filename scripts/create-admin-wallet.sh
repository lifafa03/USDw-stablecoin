#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WALLET_PATH="$PROJECT_ROOT/app/server/wallet"
CRYPTO_PATH="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com"

# Create wallet directory
mkdir -p "$WALLET_PATH"

# Get admin cert and key
CERT_PATH="$CRYPTO_PATH/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem"
PRIV_KEY_PATH="$CRYPTO_PATH/users/Admin@org1.example.com/msp/keystore/"
PRIV_KEY_FILE=$(ls "$PRIV_KEY_PATH" | head -n 1)

echo "Creating admin identity..."
node "$SCRIPT_DIR/create-wallet-identity.js" "$WALLET_PATH" "$CERT_PATH" "$PRIV_KEY_PATH/$PRIV_KEY_FILE"
echo "✓ Admin wallet created!"
