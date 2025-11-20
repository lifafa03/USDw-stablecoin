#!/bin/bash

# Enroll Application User for Fabric SDK
# This script registers and enrolls an application user with the Fabric CA

set -e

# Configuration
ORG_NAME="org1"
CA_PORT="7054"
ENROLL_ID="admin"
ENROLL_SECRET="adminpw"
APP_USER="appUser"
APP_USER_SECRET="appUserPw"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FABRIC_SAMPLES_ROOT="$PROJECT_ROOT/fabric-samples"
TEST_NETWORK_DIR="$FABRIC_SAMPLES_ROOT/test-network"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Enroll Application User${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if test-network exists
if [ ! -d "$TEST_NETWORK_DIR" ]; then
    echo -e "${RED}Error: Test network directory not found at $TEST_NETWORK_DIR${NC}"
    exit 1
fi

cd "$TEST_NETWORK_DIR"

# Check if CA is running
if ! docker ps | grep -q "ca_${ORG_NAME}"; then
    echo -e "${RED}Error: Certificate Authority for ${ORG_NAME} is not running${NC}"
    echo "Please start the network with CA enabled:"
    echo "  cd $TEST_NETWORK_DIR"
    echo "  ./network.sh up createChannel -ca"
    exit 1
fi

echo -e "${GREEN}✓ Certificate Authority is running${NC}"

# Set fabric-ca-client binary path
export PATH=${PWD}/../bin:$PATH
export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/${ORG_NAME}.example.com/

# Register the app user
echo -e "\n${BLUE}Step 1: Registering ${APP_USER}...${NC}"
fabric-ca-client register \
    --caname ca-${ORG_NAME} \
    --id.name ${APP_USER} \
    --id.secret ${APP_USER_SECRET} \
    --id.type client \
    --tls.certfiles "${PWD}/organizations/fabric-ca/${ORG_NAME}/ca-cert.pem" || true

echo -e "${GREEN}✓ User registered${NC}"

# Enroll the app user
echo -e "\n${BLUE}Step 2: Enrolling ${APP_USER}...${NC}"
fabric-ca-client enroll \
    -u https://${APP_USER}:${APP_USER_SECRET}@localhost:${CA_PORT} \
    --caname ca-${ORG_NAME} \
    -M "${PWD}/organizations/peerOrganizations/${ORG_NAME}.example.com/users/${APP_USER}@${ORG_NAME}.example.com/msp" \
    --tls.certfiles "${PWD}/organizations/fabric-ca/${ORG_NAME}/ca-cert.pem"

echo -e "${GREEN}✓ User enrolled${NC}"

# Copy the Node OU configuration
echo -e "\n${BLUE}Step 3: Configuring Node OU...${NC}"
cp "${PWD}/organizations/peerOrganizations/${ORG_NAME}.example.com/msp/config.yaml" \
   "${PWD}/organizations/peerOrganizations/${ORG_NAME}.example.com/users/${APP_USER}@${ORG_NAME}.example.com/msp/config.yaml"

echo -e "${GREEN}✓ Node OU configured${NC}"

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  Application User Enrollment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "User: ${APP_USER}"
echo -e "Organization: ${ORG_NAME}"
echo -e "\nCertificate location:"
echo -e "${PWD}/organizations/peerOrganizations/${ORG_NAME}.example.com/users/${APP_USER}@${ORG_NAME}.example.com/"
