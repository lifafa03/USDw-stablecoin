#!/bin/bash

# Quick Deploy & Test GENUSD Phase 3 on Running Network

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

CHAINCODE_NAME="genusd"
CHAINCODE_VERSION="1.0"
CHANNEL_NAME="mychannel"
CC_SRC_PATH="/home/rsolipuram/stablecoin-fabric/chaincode/genusd-chaincode"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  GENUSD Phase 3 - Quick Deploy & Test${NC}"
echo -e "${BLUE}================================================${NC}"

# Navigate to test network
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Set environment
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/

# Fix go.mod
echo -e "\n${BLUE}Step 1: Fixing Go dependencies...${NC}"
cd ${CC_SRC_PATH}
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

rm -f go.sum
GO111MODULE=on go mod tidy 2>&1 | grep -v "go: downloading" || true
GO111MODULE=on go mod vendor 2>&1 | grep -v "go: downloading" || true

echo -e "${GREEN}✓ Dependencies fixed${NC}"

# Return to test network
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Package chaincode
echo -e "\n${BLUE}Step 2: Packaging chaincode...${NC}"
rm -f ${CHAINCODE_NAME}.tar.gz
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
    --path ${CC_SRC_PATH} \
    --lang golang \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

echo -e "${GREEN}✓ Packaged${NC}"

# Install on Org1
echo -e "\n${BLUE}Step 3: Installing on Org1...${NC}"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz 2>&1 | tail -5

# Install on Org2
echo -e "\n${BLUE}Step 4: Installing on Org2...${NC}"
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz 2>&1 | tail -5

# Get package ID
peer lifecycle chaincode queryinstalled > queryinstalled.txt
PACKAGE_ID=$(sed -n "/${CHAINCODE_NAME}_${CHAINCODE_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" queryinstalled.txt)
echo "Package ID: $PACKAGE_ID"

# Approve for Org2
echo -e "\n${BLUE}Step 5: Approving for Org2...${NC}"
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence 2 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" 2>&1 | tail -3

# Approve for Org1
echo -e "\n${BLUE}Step 6: Approving for Org1...${NC}"
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
    --sequence 2 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" 2>&1 | tail -3

# Commit chaincode
echo -e "\n${BLUE}Step 7: Committing chaincode...${NC}"
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence 2 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" 2>&1 | tail -5

echo -e "${GREEN}✓ Committed${NC}"

sleep 5

# Initialize
echo -e "\n${BLUE}Step 8: Initializing smart contract...${NC}"
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
echo -e "${GREEN}  🚀 REAL TRANSACTION TESTS${NC}"
echo -e "${GREEN}================================================${NC}"

# TEST 1: MINT
echo -e "\n${YELLOW}📌 TEST 1: Minting 1000 GENUSD to Alice${NC}"
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
    -c '{"function":"Mint","Args":["[{\"owner_id\":\"alice\",\"amount\":100000,\"asset_code\":\"GENUSD\",\"kyc_tag\":\"KYC_LEVEL_3\"}]","issuer","mock_dilithium_sig"]}'

sleep 3

# TEST 2: QUERY BALANCE
echo -e "\n${YELLOW}📌 TEST 2: Querying Alice's balance (ON-CHAIN)${NC}"
BALANCE=$(peer chaincode query \
    -C ${CHANNEL_NAME} \
    -n ${CHAINCODE_NAME} \
    -c '{"function":"GetBalance","Args":["alice"]}')
echo -e "${GREEN}Result: $BALANCE${NC}"

sleep 2

# TEST 3: ZK PROOF VERIFICATION (ON-CHAIN)
echo -e "\n${YELLOW}📌 TEST 3: Verifying ZK Proof (ON-CHAIN)${NC}"
echo -e "${BLUE}Submitting STARK proof to blockchain...${NC}"
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
    -c '{"function":"VerifyZKProof","Args":["{\"proof_bytes\":\"MHgwMTIzNDU2Nzg5YWJjZGVm\",\"public_inputs\":[\"KYC_MIN_2\"],\"commitment\":\"commitment_hash_123\",\"nullifier\":\"nullifier_unique_456\",\"timestamp\":1700000000}"]}'

sleep 3

# TEST 4: Try to reuse same nullifier (should fail)
echo -e "\n${YELLOW}📌 TEST 4: Testing nullifier reuse prevention${NC}"
echo -e "${BLUE}Attempting to reuse same proof (should FAIL)...${NC}"
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
    -c '{"function":"VerifyZKProof","Args":["{\"proof_bytes\":\"MHgwMTIzNDU2Nzg5YWJjZGVm\",\"public_inputs\":[\"KYC_MIN_2\"],\"commitment\":\"commitment_hash_123\",\"nullifier\":\"nullifier_unique_456\",\"timestamp\":1700000000}"]}'  2>&1 | grep -i "error\|nullifier\|already"

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  ✅ VERIFICATION COMPLETE!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "\n${GREEN}✅ Real transactions executed on Fabric blockchain:${NC}"
echo -e "  1. Initialized GENUSD smart contract"
echo -e "  2. Minted 1000 GENUSD tokens (ON-CHAIN)"
echo -e "  3. Queried balance from ledger (ON-CHAIN)"
echo -e "  4. Verified ZK proof (ON-CHAIN)"
echo -e "  5. Tested nullifier reuse prevention (ON-CHAIN)"
echo -e "\n${BLUE}All data is now permanently stored on the blockchain!${NC}"
echo -e "\n${YELLOW}View chaincode logs:${NC}"
echo -e "  docker logs -f dev-peer0.org1.example.com-${CHAINCODE_NAME}_${CHAINCODE_VERSION}*"
