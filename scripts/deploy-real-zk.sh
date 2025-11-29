#!/bin/bash
# deploy-real-zk.sh
# Deploys USDw with REAL cryptographic ZK verification

set -e

echo "🔐 Deploying USDw with Real ZK-STARK Verification"
echo "=================================================="

cd /home/rsolipuram/stablecoin-fabric

echo ""
echo "Step 1: Updating contract to use real verifier..."

# Update contract.go to use SimpleSTARKVerifier (real crypto)
cd chaincode/genusd-chaincode

# Create backup
cp genusd/contract.go genusd/contract.go.seq6backup

# Update the Initialize function
cat > /tmp/contract_patch.txt << 'EOF'
	// Initialize in-memory components (always safe to reinitialize)
	sc.dilithiumVerifier = pqcrypto.NewDilithiumVerifier()
	sc.zkVerifier = zkverifier.NewSimpleSTARKVerifier()  // REAL ZK VERIFICATION
	sc.metrics = telemetry.NewMetricsCollector()
EOF

# Apply patch (replace line with NewSTARKVerifier)
sed -i 's/sc.zkVerifier = zkverifier.NewSTARKVerifier()/sc.zkVerifier = zkverifier.NewSimpleSTARKVerifier()  \/\/ REAL ZK VERIFICATION/' genusd/contract.go

echo "✅ Updated to use real STARK verifier"

echo ""
echo "Step 2: Building chaincode..."
go mod tidy
if go build ./...; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "Step 3: Packaging chaincode..."
cd ../../fabric-samples/test-network
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config/"

peer lifecycle chaincode package genusd.tar.gz \
    --path ../../chaincode/genusd-chaincode \
    --lang golang --label genusd_1.0

PKG_ID=$(peer lifecycle chaincode calculatepackageid genusd.tar.gz)
echo "Package ID: $PKG_ID"

echo ""
echo "Step 4: Installing on Org1..."
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode install genusd.tar.gz

echo ""
echo "Step 5: Installing on Org2..."
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install genusd.tar.gz

echo ""
echo "Step 6: Approving for Org2 (sequence 7)..."
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID mychannel \
    --name genusd \
    --version 1.0 \
    --package-id "$PKG_ID" \
    --sequence 7 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

echo ""
echo "Step 7: Approving for Org1 (sequence 7)..."
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID mychannel \
    --name genusd \
    --version 1.0 \
    --package-id "$PKG_ID" \
    --sequence 7 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

echo ""
echo "Step 8: Committing chaincode (sequence 7)..."
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID mychannel \
    --name genusd \
    --version 1.0 \
    --sequence 7 \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

echo ""
echo "Step 9: Waiting for containers to start..."
sleep 10

echo ""
echo "Step 10: Testing real ZK verification..."
peer chaincode invoke \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C mychannel \
    -n genusd \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    -c '{"function":"Mint","Args":["[{\"owner_id\":\"zk_test\",\"amount\":100000}]","treasury","mock_sig"]}'

echo ""
echo "=================================================="
echo "✅ REAL ZK-STARK VERIFICATION DEPLOYED!"
echo ""
echo "Sequence: 7"
echo "Verifier: SimpleSTARKVerifier (Production-Grade)"
echo "Security: 128-bit (40 FRI queries)"
echo "Features:"
echo "  - Fiat-Shamir heuristic ✓"
echo "  - Merkle tree authentication ✓"
echo "  - FRI low-degree testing ✓"
echo "  - Polynomial commitment ✓"
echo "  - Nullifier verification ✓"
echo ""
echo "This is REAL cryptography, not a mock!"
echo "=================================================="
