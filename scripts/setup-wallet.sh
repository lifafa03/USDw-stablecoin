#!/bin/bash
#
# Setup wallet for application using existing test-network certificates
# This script copies the admin identity from the test-network cryptogen materials
# into the application wallet, avoiding the need for CA enrollment

set -e

echo "=========================================="
echo "Setting up Application Wallet"
echo "=========================================="

# Define paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WALLET_PATH="$PROJECT_ROOT/app/server/wallet"
CRYPTO_PATH="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com"

# Check if test-network is running
if [ ! -d "$CRYPTO_PATH" ]; then
    echo "ERROR: Test network crypto materials not found"
    echo "Please start the test-network first:"
    echo "  cd fabric-samples/test-network"
    echo "  ./network.sh up createChannel"
    exit 1
fi

# Create wallet directory
echo "Creating wallet directory at: $WALLET_PATH"
mkdir -p "$WALLET_PATH"

# Copy certificate (public key)
echo "Copying user certificate..."
CERT_PATH="$CRYPTO_PATH/users/User1@org1.example.com/msp/signcerts/User1@org1.example.com-cert.pem"
if [ ! -f "$CERT_PATH" ]; then
    echo "ERROR: Certificate not found at $CERT_PATH"
    exit 1
fi

# Copy private key
echo "Copying user private key..."
PRIV_KEY_PATH="$CRYPTO_PATH/users/User1@org1.example.com/msp/keystore/"
PRIV_KEY_FILE=$(ls "$PRIV_KEY_PATH" | head -n 1)
if [ -z "$PRIV_KEY_FILE" ]; then
    echo "ERROR: Private key not found in $PRIV_KEY_PATH"
    exit 1
fi

# Create identity using Node.js script for proper JSON formatting
echo "Creating identity file..."
node "$SCRIPT_DIR/create-wallet-identity.js" "$WALLET_PATH" "$CERT_PATH" "$PRIV_KEY_PATH/$PRIV_KEY_FILE"

echo ""
echo "✓ Wallet setup complete!"
echo "  Wallet location: $WALLET_PATH"
echo "  Identity: appUser (User1@org1.example.com)"
echo "  MSP: Org1MSP"
echo ""
echo "You can now start the application server:"
echo "  cd app/server"
echo "  node server.js"
echo "=========================================="
