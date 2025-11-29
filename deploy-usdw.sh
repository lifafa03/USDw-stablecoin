#!/bin/bash

# Deploy USDw Chaincode (renamed from GENUSD)
# Sequence 3 upgrade

set -e

cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Environment
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config/"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

CHANNEL_NAME="mychannel"
CHAINCODE_NAME="genusd"
CHAINCODE_VERSION="1.0"
SEQUENCE="3"

echo "=== Upgrading to USDw (Sequence 3) ==="
echo ""

# Package
echo "Step 1: Packaging chaincode..."
cd /home/rsolipuram/stablecoin-fabric
tar czf genusd.tar.gz -C chaincode/genusd-chaincode .

cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

peer lifecycle chaincode package genusd.tar.gz \
    --path /home/rsolipuram/stablecoin-fabric/chaincode/genusd-chaincode \
    --lang golang \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

# Install Org1
echo "Step 2: Installing on Org1..."
peer lifecycle chaincode install genusd.tar.gz

# Install Org2
echo "Step 3: Installing on Org2..."
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install genusd.tar.gz

# Get package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk '{print $3}' | sed 's/,$//' | tail -1)
echo "Package ID: $PACKAGE_ID"

# Approve Org2
echo "Step 4: Approving for Org2..."
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Approve Org1
echo "Step 5: Approving for Org1..."
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Commit
echo "Step 6: Committing chaincode..."
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence ${SEQUENCE} \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

sleep 3

echo ""
echo "=== Upgrade Complete! ==="
echo "Asset code changed: GENUSD → USDw"
echo ""

# Test minting with new asset code
echo "Test: Minting 10,000 USDw to test_user..."
peer chaincode invoke \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C ${CHANNEL_NAME} \
    -n ${CHAINCODE_NAME} \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    -c '{"function":"Mint","Args":["[{\"owner_id\":\"test_user\",\"amount\":10000,\"asset_code\":\"USDw\"}]","treasury","mock_sig"]}'

sleep 3

# Query balance
echo ""
echo "Querying test_user balance..."
peer chaincode query -C ${CHANNEL_NAME} -n ${CHAINCODE_NAME} -c '{"function":"GetBalance","Args":["test_user"]}'

echo ""
echo "✅ USDw is now live on blockchain!"
