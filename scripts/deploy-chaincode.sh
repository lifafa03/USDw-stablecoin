#!/bin/bash

# Deploy Stablecoin Chaincode to Hyperledger Fabric Test Network
# This script packages, installs, approves, and commits the chaincode

set -e

# Configuration
CHAINCODE_NAME="stablecoin"
CHAINCODE_VERSION="1.1"
CHAINCODE_SEQUENCE=2
CHANNEL_NAME="mychannel"
CC_RUNTIME_LANGUAGE="node"
CC_SRC_PATH="chaincode/stablecoin-js"

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
echo -e "${BLUE}  Stablecoin Chaincode Deployment Script${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if test-network exists
if [ ! -d "$TEST_NETWORK_DIR" ]; then
    echo -e "${RED}Error: Test network directory not found at $TEST_NETWORK_DIR${NC}"
    exit 1
fi

cd "$TEST_NETWORK_DIR"

# Check if network is running
if ! docker ps | grep -q "peer0.org1.example.com"; then
    echo -e "${RED}Error: Fabric test network is not running${NC}"
    echo "Please start the network first:"
    echo "  cd $TEST_NETWORK_DIR"
    echo "  ./network.sh up createChannel -c mychannel -ca"
    exit 1
fi

echo -e "${GREEN}✓ Test network is running${NC}"

# Set environment variables
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/

# Package the chaincode
echo -e "\n${BLUE}Step 1: Packaging chaincode...${NC}"
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
    --path ${PROJECT_ROOT}/${CC_SRC_PATH} \
    --lang ${CC_RUNTIME_LANGUAGE} \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

echo -e "${GREEN}✓ Chaincode packaged successfully${NC}"

# Install on Org1
echo -e "\n${BLUE}Step 2: Installing chaincode on Org1...${NC}"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

echo -e "${GREEN}✓ Chaincode installed on Org1${NC}"

# Install on Org2
echo -e "\n${BLUE}Step 3: Installing chaincode on Org2...${NC}"
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

echo -e "${GREEN}✓ Chaincode installed on Org2${NC}"

# Query installed chaincode to get package ID
echo -e "\n${BLUE}Step 4: Querying installed chaincode...${NC}"
peer lifecycle chaincode queryinstalled > queryinstalled.txt
PACKAGE_ID=$(sed -n "/${CHAINCODE_NAME}_${CHAINCODE_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" queryinstalled.txt)

if [ -z "$PACKAGE_ID" ]; then
    echo -e "${RED}Error: Package ID not found${NC}"
    exit 1
fi

echo "Package ID: $PACKAGE_ID"
echo -e "${GREEN}✓ Package ID retrieved${NC}"

# Approve for Org2
echo -e "\n${BLUE}Step 5: Approving chaincode for Org2...${NC}"
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

echo -e "${GREEN}✓ Chaincode approved for Org2${NC}"

# Approve for Org1
echo -e "\n${BLUE}Step 6: Approving chaincode for Org1...${NC}"
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

echo -e "${GREEN}✓ Chaincode approved for Org1${NC}"

# Check commit readiness
echo -e "\n${BLUE}Step 7: Checking commit readiness...${NC}"
peer lifecycle chaincode checkcommitreadiness \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    --output json

echo -e "${GREEN}✓ Commit readiness checked${NC}"

# Commit the chaincode
echo -e "\n${BLUE}Step 8: Committing chaincode definition...${NC}"
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

echo -e "${GREEN}✓ Chaincode committed successfully${NC}"

# Query committed chaincode
echo -e "\n${BLUE}Step 9: Querying committed chaincode...${NC}"
peer lifecycle chaincode querycommitted \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Initialize the ledger
echo -e "\n${BLUE}Step 10: Initializing ledger...${NC}"
peer chaincode invoke \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C ${CHANNEL_NAME} \
    -n ${CHAINCODE_NAME} \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
    -c '{"function":"InitLedger","Args":[]}'

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  Chaincode Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "Chaincode Name: ${CHAINCODE_NAME}"
echo -e "Version: ${CHAINCODE_VERSION}"
echo -e "Channel: ${CHANNEL_NAME}"
echo -e "\nYou can now use the REST API to interact with the chaincode."
