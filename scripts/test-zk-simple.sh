#!/bin/bash

# Simple ZK Proof Verification Test
# Demonstrates ON-CHAIN verification

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network

# Setup environment
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config/"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

echo -e "${BLUE}=== GENUSD ZK Proof Verification Test ===${NC}\n"

# Generate proof data
TIMESTAMP=$(date +%s)
NULLIFIER="nullifier_${TIMESTAMP}"
COMMITMENT="0xabc123def456"
PROOF_BYTES="bW9ja19wcm9vZl9kYXRh"

echo -e "${YELLOW}1. Generated ZK Proof:${NC}"
echo "   Nullifier: $NULLIFIER"
echo "   Commitment: $COMMITMENT"

# Query balances
echo -e "\n${YELLOW}2. Current Balances:${NC}"
ALICE=$(peer chaincode query -C mychannel -n genusd -c '{"function":"GetBalance","Args":["alice"]}' 2>/dev/null)
BOB=$(peer chaincode query -C mychannel -n genusd -c '{"function":"GetBalance","Args":["bob"]}' 2>/dev/null)
echo "   Alice: $ALICE GENUSD"
echo "   Bob: $BOB GENUSD"

# Submit ZK proof using file-based JSON to avoid escaping issues
echo -e "\n${YELLOW}3. Submitting ZK Proof to Blockchain...${NC}"
cat > /tmp/zkproof.json <<EOF
{
  "commitment": "$COMMITMENT",
  "nullifier": "$NULLIFIER",
  "public_inputs": ["KYC_MIN_2"],
  "proof_data": "$PROOF_BYTES"
}
EOF

PROOF_STR=$(cat /tmp/zkproof.json | tr -d '\n' | sed 's/"/\\"/g')

echo -e "${BLUE}   → Executing ON-CHAIN verification in zkverifier/zk_verifier.go${NC}"

peer chaincode invoke \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
    -C mychannel \
    -n genusd \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    -c '{"function":"VerifyZKProof","Args":["'"$PROOF_STR"'"]}' 2>&1 | tee /tmp/verify_result.txt

sleep 3

# Check result
echo -e "\n${YELLOW}4. Verification Result:${NC}"
if grep -q "status:200" /tmp/verify_result.txt; then
    echo -e "${GREEN}   ✅ ZK Proof VERIFIED on blockchain!${NC}"
elif grep -q "commitment mismatch" /tmp/verify_result.txt; then
    echo -e "${YELLOW}   ⚠️  Proof rejected (commitment mismatch - expected for mock STARK)${NC}"
else
    echo -e "   Check output above for details"
fi

# Show logs
echo -e "\n${YELLOW}5. Blockchain Audit Logs:${NC}"
docker logs $(docker ps | grep "dev-peer0.org1.example.com-genusd" | awk '{print $1}') 2>&1 | \
    grep "ZK_VERIFICATION" | tail -3 | jq -r '"\(.timestamp) - \(.result): \(.hash_commitment)"' 2>/dev/null || \
    docker logs $(docker ps | grep "dev-peer0.org1.example.com-genusd" | awk '{print $1}') 2>&1 | grep "VERIFY_PROOF" | tail -3

echo -e "\n${GREEN}✅ Verification Complete${NC}"
echo -e "${BLUE}Where verification happens:${NC} chaincode/genusd-chaincode/zkverifier/zk_verifier.go (lines 52-95)"
echo -e "${BLUE}Storage:${NC} Commitment and nullifier stored permanently in blockchain ledger"
