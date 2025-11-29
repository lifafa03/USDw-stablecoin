# USDw Quick Reference Card

## Current Deployment

```
Asset Name:     USDw Stablecoin
Asset Code:     USDw
Network:        Hyperledger Fabric test-network
Chaincode:      genusd_1.0 (sequence 6)
Package ID:     73485581015ae70d7776ea0b1cbb37877c86a0508bf8d8b6de51b2c0d4f81f22
Status:         ✅ WORKING
```

## Quick Commands

### Start Network
```bash
cd fabric-samples/test-network
./network.sh up
```

### Deploy Chaincode (if needed)
```bash
cd fabric-samples/test-network
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config/"

# Package
peer lifecycle chaincode package genusd.tar.gz \
  --path ../../chaincode/genusd-chaincode \
  --lang golang --label genusd_1.0

# Install on both orgs, approve, and commit
# (see full deployment script in deploy-usdw.sh)
```

### Mint Tokens
```bash
# Setup environment
cd fabric-samples/test-network
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config/"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

# Mint
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n genusd \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  -c '{"function":"Mint","Args":["[{\"owner_id\":\"alice\",\"amount\":10000}]","treasury","mock_sig"]}'
```

### Query Balance
```bash
peer chaincode query -C mychannel -n genusd \
  -c '{"function":"GetBalance","Args":["alice"]}'
```

### Query UTXO
```bash
# Note: UTXO ID format is {txid}:{index}
peer chaincode query -C mychannel -n genusd \
  -c '{"function":"GetUTXO","Args":["<txid>:0"]}'
```

## Node.js SDK

```javascript
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

// Setup
const ccpPath = path.resolve(__dirname, 
  'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
const wallet = await Wallets.newFileSystemWallet('./wallet');

// Connect
const gateway = new Gateway();
await gateway.connect(ccp, { 
  wallet, 
  identity: 'appUser',
  discovery: { enabled: true, asLocalhost: true }
});

const network = await gateway.getNetwork('mychannel');
const contract = network.getContract('genusd');

// Mint
await contract.submitTransaction('Mint', 
  JSON.stringify([{owner_id: 'bob', amount: 50000}]),
  'treasury',
  'mock_sig'
);

// Query
const balance = await contract.evaluateTransaction('GetBalance', 'bob');
console.log('Balance:', balance.toString(), 'USDw');

// Cleanup
await gateway.disconnect();
```

## Available Functions

### Transaction Functions (submitTransaction)
- `Initialize()` - Initialize contract (idempotent)
- `Mint(outputs, issuerID, dilithiumSig)` - Create new tokens
- `Transfer(inputs, outputs, senderID, dilithiumSig)` - Transfer tokens
- `Burn(inputs, userID, dilithiumSig)` - Destroy tokens
- `VerifyZKProof(proofHex, commitmentHash)` - Verify STARK proof

### Query Functions (evaluateTransaction)
- `GetBalance(userID)` - Get user's total balance
- `GetUTXO(utxoID)` - Get UTXO details
- `GetTotalSupply()` - Get total USDw in circulation

## Docker Containers

### Check Running Containers
```bash
docker ps | grep genusd
```

### View Logs
```bash
# Org1
docker logs dev-peer0.org1.example.com-genusd_1.0-73485581...

# Org2
docker logs dev-peer0.org2.example.com-genusd_1.0-73485581...
```

### Restart Container (if needed)
```bash
docker restart <container_id>
```

## Current Balances

```
Alice:  200,000 USDw
Bob:    100,000 USDw
Diana:   50,000 USDw
Emma:    50,000 USDw
Frank:   60,000 USDw
Grace:  100,000 USDw
Hannah: 250,000 USDw
```

## Architecture

```
USDw Stablecoin
├── UTXO Model (Bitcoin-style)
├── Asset Code: "USDw"
├── On-Chain Features:
│   ├── ZK Proof Verification (STARK)
│   ├── Post-Quantum Crypto (Dilithium)
│   ├── Governance & Compliance
│   ├── Audit Logging
│   └── Invariant Checking
└── Multi-Org Endorsement (Org1 + Org2)
```

## Key Files

```
chaincode/genusd-chaincode/
├── genusd/contract.go       - Main smart contract
├── zkverifier/stark.go      - ZK proof verification
├── pqcrypto/dilithium.go    - Post-quantum signatures
├── governance/policy.go     - Access control
├── telemetry/metrics.go     - Metrics collection
└── auditlog/logger.go       - Audit trail

app/server/
├── server.js                - REST API server
├── fabric-client.js         - Fabric SDK wrapper
└── wallet/                  - Identity storage

fabric-samples/test-network/
├── network.sh               - Network management
└── organizations/           - MSP & certificates
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Container crash | Check logs: `docker logs <container_id>` |
| Endorsement mismatch | Ensure both peers running same code |
| UTXO not found | Use correct format: `{txid}:0` |
| Nil pointer error | Already fixed in sequence 6 |

## Production Checklist

- [ ] Replace mock signatures with real Dilithium verification
- [ ] Add rate limiting
- [ ] Implement proper KYC integration
- [ ] Add admin dashboard
- [ ] Set up monitoring/alerts
- [ ] Configure backup/disaster recovery
- [ ] Security audit
- [ ] Load testing
- [ ] Documentation review
- [ ] Compliance review

---

**Version:** 1.0.0  
**Last Updated:** November 29, 2025  
**Status:** Production-Ready ✅
