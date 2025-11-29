#!/bin/bash

# Deploy GENUSD Phase 3 Chaincode (Go) to Hyperledger Fabric
# This script starts the network, packages, installs, and tests the chaincode

set -e

# Configuration
CHAINCODE_NAME="genusd"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE="1"
CHANNEL_NAME="genusdc"
CC_RUNTIME_LANGUAGE="golang"
CC_SRC_PATH="/home/rsolipuram/stablecoin-fabric/chaincode/genusd-chaincode"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  GENUSD Phase 3 Chaincode Deployment${NC}"
echo -e "${BLUE}  Quantum-Resistant Stablecoin${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if Fabric binaries exist
if [ ! -d "/home/rsolipuram/stablecoin-fabric/fabric-samples/bin" ]; then
    echo -e "${RED}Error: Fabric binaries not found${NC}"
    echo "Downloading Fabric binaries..."
    cd /home/rsolipuram/stablecoin-fabric
    curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.4 1.5.5 -d -s
fi

# Navigate to test network
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Set environment variables
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/

echo -e "\n${BLUE}Step 1: Starting Fabric Network...${NC}"
# Bring down any existing network
./network.sh down 2>/dev/null || true

# Start new network with channel
./network.sh up createChannel -c ${CHANNEL_NAME} -ca

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start network${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Network started successfully${NC}"

# Build the Go chaincode
echo -e "\n${BLUE}Step 2: Building Go chaincode...${NC}"
cd ${CC_SRC_PATH}

# Fix go.mod to remove invalid dependency
cat > go.mod << 'EOF'
module github.com/lifafa03/genusd-chaincode

go 1.21

require (
	github.com/hyperledger/fabric-contract-api-go v1.2.2
	github.com/prometheus/client_golang v1.17.0
	github.com/sirupsen/logrus v1.9.3
	golang.org/x/crypto v0.17.0
)
EOF

# Download dependencies
GO111MODULE=on go mod tidy
GO111MODULE=on go mod vendor

echo -e "${GREEN}✓ Go dependencies resolved${NC}"

# Return to test network
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Package the chaincode
echo -e "\n${BLUE}Step 3: Packaging chaincode...${NC}"
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
    --path ${CC_SRC_PATH} \
    --lang ${CC_RUNTIME_LANGUAGE} \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

echo -e "${GREEN}✓ Chaincode packaged: ${CHAINCODE_NAME}.tar.gz${NC}"

# Install on Org1
echo -e "\n${BLUE}Step 4: Installing chaincode on Org1...${NC}"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

echo -e "${GREEN}✓ Chaincode installed on Org1${NC}"

# Install on Org2
echo -e "\n${BLUE}Step 5: Installing chaincode on Org2...${NC}"
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

echo -e "${GREEN}✓ Chaincode installed on Org2${NC}"

# Query installed chaincode to get package ID
echo -e "\n${BLUE}Step 6: Querying installed chaincode...${NC}"
peer lifecycle chaincode queryinstalled > queryinstalled.txt
PACKAGE_ID=$(sed -n "/${CHAINCODE_NAME}_${CHAINCODE_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" queryinstalled.txt)

if [ -z "$PACKAGE_ID" ]; then
    echo -e "${RED}Error: Package ID not found${NC}"
    cat queryinstalled.txt
    exit 1
fi

echo "Package ID: $PACKAGE_ID"
echo -e "${GREEN}✓ Package ID retrieved${NC}"

# Approve for Org2
echo -e "\n${BLUE}Step 7: Approving chaincode for Org2...${NC}"
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
echo -e "\n${BLUE}Step 8: Approving chaincode for Org1...${NC}"
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
echo -e "\n${BLUE}Step 9: Checking commit readiness...${NC}"
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
echo -e "\n${BLUE}Step 10: Committing chaincode definition...${NC}"
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

# Initialize the smart contract
echo -e "\n${BLUE}Step 11: Initializing GENUSD Smart Contract...${NC}"
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
    -c '{"function":"Initialize","Args":[]}'

sleep 5

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  Phase 3 Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"

# Test the deployment with real transactions
echo -e "\n${BLUE}Step 12: Running Real Transaction Tests...${NC}"

# Test 1: Mint tokens
echo -e "\n${YELLOW}Test 1: Minting GENUSD tokens...${NC}"
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
    -c '{"function":"Mint","Args":["[{\"owner_id\":\"alice\",\"amount\":100000,\"asset_code\":\"GENUSD\",\"kyc_tag\":\"KYC_LEVEL_3\"}]","issuer","mock_sig"]}'

sleep 3

# Test 2: Query balance
echo -e "\n${YELLOW}Test 2: Querying Alice's balance...${NC}"
peer chaincode query \
    -C ${CHANNEL_NAME} \
    -n ${CHAINCODE_NAME} \
    -c '{"function":"GetBalance","Args":["alice"]}'

echo -e "\n${YELLOW}Test 3: Testing ZK Proof Verification...${NC}"
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
    -c '{"function":"VerifyZKProof","Args":["{\"proof_bytes\":\"0x0123456789abcdef\",\"public_inputs\":[\"KYC_MIN_2\"],\"commitment\":\"commitment_hash_123\",\"nullifier\":\"nullifier_456\",\"timestamp\":1700000000}"]}'

sleep 3

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  ✅ All Tests Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "\nChaincode: ${CHAINCODE_NAME}"
echo -e "Version: ${CHAINCODE_VERSION}"
echo -e "Channel: ${CHANNEL_NAME}"
echo -e "\n${BLUE}Real transactions executed on blockchain:${NC}"
echo -e "  1. Initialized smart contract"
echo -e "  2. Minted 100,000 GENUSD to Alice"
echo -e "  3. Queried Alice's balance"
echo -e "  4. Verified ZK proof on-chain"
echo -e "\n${YELLOW}Network is running. To test more:${NC}"
echo -e "  peer chaincode invoke -C ${CHANNEL_NAME} -n ${CHAINCODE_NAME} -c '...'"
echo -e "  peer chaincode query -C ${CHANNEL_NAME} -n ${CHAINCODE_NAME} -c '...'"
echo -e "\n${YELLOW}To stop the network:${NC}"
echo -e "  cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network"
echo -e "  ./network.sh down"
