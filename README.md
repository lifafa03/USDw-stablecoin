# Stablecoin Prototype on Hyperledger Fabric - Phase 1

A minimal account-based stablecoin implementation on Hyperledger Fabric with REST API endpoints. This is Phase 1 of a research CBDC/stablecoin prototype, focusing on basic account management and token operations.

## Project Overview

This project implements a simple stablecoin smart contract (chaincode) on Hyperledger Fabric using the test-network infrastructure. It provides:

- **Account-based token management** (not UTXO)
- **Core operations**: Mint, Transfer, Burn
- **Account freezing/unfreezing capabilities**
- **Transaction history tracking**
- **REST API** for easy interaction
- **Comprehensive test suite**

## Architecture

```
stablecoin-fabric/
├── chaincode/
│   └── stablecoin-js/          # Smart contract implementation
│       ├── package.json
│       ├── index.js
│       └── lib/
│           └── stablecoin-contract.js
├── app/
│   └── server/                 # REST API server
│       ├── package.json
│       ├── server.js           # Express server
│       ├── fabric-client.js    # Fabric SDK integration
│       └── wallet/             # Identity wallet (generated)
├── tests/
│   └── chaincode/              # Test suite
│       ├── package.json
│       └── stablecoin.test.js
├── scripts/
│   ├── deploy-chaincode.sh     # Chaincode deployment script
│   └── enroll-app-user.sh      # User enrollment script
├── fabric-samples/             # Hyperledger Fabric test-network
└── README.md
```

## Prerequisites

- **Node.js**: v16 or higher
- **npm**: v8 or higher
- **Docker & Docker Compose**: For running Fabric network
- **Hyperledger Fabric binaries**: v2.5.x
- **Linux environment**: Tested on Ubuntu/Debian

## Quick Start

### 1. Start the Fabric Test Network

```bash
cd fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca
```

This will:
- Start the Fabric network with 2 organizations
- Create a channel named `mychannel`
- Start Certificate Authorities for both orgs

### 2. Install Chaincode Dependencies

```bash
cd ../../chaincode/stablecoin-js
npm install
```

### 3. Deploy the Chaincode

```bash
cd ../../scripts
./deploy-chaincode.sh
```

This script will:
- Package the chaincode
- Install on both Org1 and Org2 peers
- Approve the chaincode definition for both orgs
- Commit the chaincode to the channel
- Initialize the ledger

**Expected output**: You should see green checkmarks (✓) for each step and finally "Chaincode Deployment Complete!"

### 4. Install REST API Dependencies

```bash
cd ../app/server
npm install
```

### 5. Start the REST API Server

```bash
node server.js
```

The server will:
- Connect to the Fabric network
- Automatically enroll an application user
- Start listening on port 3000

**Expected output**:
```
================================================
  Stablecoin REST API Server
================================================
Server running on port 3000
...
```

### 6. Test the API

Open a new terminal and try these commands:

```bash
# Check server health
curl http://localhost:3000/health

# Mint tokens to Alice
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{"accountId": "alice", "amount": 1000}'

# Check Alice's balance
curl http://localhost:3000/balance/alice

# Transfer tokens from Alice to Bob
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "alice", "to": "bob", "amount": 250}'

# Check total supply
curl http://localhost:3000/totalsupply

# Burn tokens
curl -X POST http://localhost:3000/burn \
  -H "Content-Type: application/json" \
  -d '{"accountId": "alice", "amount": 100}'
```

## Chaincode API

### Data Model

**Account**: Stored as `acct:<accountId>`
```javascript
{
  "balance": number,
  "frozen": boolean
}
```

**Total Supply**: Stored as `meta:totalSupply`
```javascript
number
```

### Chaincode Functions

#### Mint(ctx, accountId, amount)
- **Permission**: Admin only (Org1MSP)
- **Description**: Create new tokens and add to an account
- **Increases**: Account balance, Total supply

#### Transfer(ctx, fromAccountId, toAccountId, amount)
- **Permission**: Any user
- **Description**: Transfer tokens between accounts
- **Validations**: Sufficient balance, account not frozen
- **Effect**: Decreases sender balance, increases receiver balance

#### Burn(ctx, accountId, amount)
- **Permission**: Any user
- **Description**: Destroy tokens from an account
- **Decreases**: Account balance, Total supply

#### BalanceOf(ctx, accountId)
- **Permission**: Any user
- **Description**: Query account balance and frozen status
- **Returns**: `{ accountId, balance, frozen }`

#### TotalSupply(ctx)
- **Permission**: Any user
- **Description**: Query total token supply
- **Returns**: `{ totalSupply }`

#### GetAccountHistory(ctx, accountId)
- **Permission**: Any user
- **Description**: Get transaction history for an account
- **Returns**: Array of historical records with timestamps

#### FreezeAccount(ctx, accountId)
- **Permission**: Admin only (Org1MSP)
- **Description**: Freeze an account (prevents transfers)

#### UnfreezeAccount(ctx, accountId)
- **Permission**: Admin only (Org1MSP)
- **Description**: Unfreeze a previously frozen account

## REST API Endpoints

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/health` | - | Server health check |
| POST | `/mint` | `{ accountId, amount }` | Mint tokens to account |
| POST | `/transfer` | `{ from, to, amount }` | Transfer tokens |
| POST | `/burn` | `{ accountId, amount }` | Burn tokens |
| GET | `/balance/:accountId` | - | Get account balance |
| GET | `/totalsupply` | - | Get total supply |
| GET | `/history/:accountId` | - | Get account history |
| POST | `/freeze` | `{ accountId }` | Freeze account |
| POST | `/unfreeze` | `{ accountId }` | Unfreeze account |

### Response Format

**Success Response:**
```json
{
  "success": true,
  "data": {
    // Operation-specific data
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

## Running Tests

### Install Test Dependencies

```bash
cd tests/chaincode
npm install
```

### Run Tests

```bash
npm test
```

The test suite includes:
- ✓ Initialization checks
- ✓ Minting operations (including failure scenarios)
- ✓ Transfer operations (including validation)
- ✓ Burning operations
- ✓ Account history retrieval
- ✓ Account freezing/unfreezing
- ✓ Complete transaction flow (Mint → Transfer → Burn)

**Expected output**: All tests should pass with green checkmarks.

## Manual Testing with Peer CLI

You can also interact with the chaincode directly using the Fabric peer CLI:

```bash
# Set environment variables
cd fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Mint tokens
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel \
  -n stablecoin \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  -c '{"function":"Mint","Args":["testAccount","1000"]}'

# Query balance
peer chaincode query \
  -C mychannel \
  -n stablecoin \
  -c '{"function":"BalanceOf","Args":["testAccount"]}'
```

## Development Workflow

### Updating the Chaincode

1. Make changes to `chaincode/stablecoin-js/lib/stablecoin-contract.js`
2. Increment version in `scripts/deploy-chaincode.sh` (CHAINCODE_VERSION and CHAINCODE_SEQUENCE)
3. Redeploy:
   ```bash
   cd scripts
   ./deploy-chaincode.sh
   ```

### Adding New REST Endpoints

1. Edit `app/server/server.js` to add new routes
2. Add corresponding methods in `app/server/fabric-client.js` if needed
3. Restart the server:
   ```bash
   cd app/server
   node server.js
   ```

## Troubleshooting

### Network Not Running
```bash
Error: Fabric test network is not running
```
**Solution**: Start the network:
```bash
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
```

### Connection Profile Not Found
```bash
Error: Connection profile not found
```
**Solution**: Ensure the test-network has been started and the organizations folder exists.

### Chaincode Already Exists
If redeploying with the same version:
```bash
Error: chaincode definition ... already exists
```
**Solution**: Either:
- Increment `CHAINCODE_VERSION` and `CHAINCODE_SEQUENCE` in `deploy-chaincode.sh`
- Or take down the network and restart fresh:
  ```bash
  cd fabric-samples/test-network
  ./network.sh down
  ./network.sh up createChannel -c mychannel -ca
  ```

### Permission Errors (Not Admin)
```bash
Error: Only admin (Org1MSP) can perform this operation
```
**Solution**: Mint and freeze/unfreeze operations require Org1MSP identity. Ensure you're using the correct identity in your wallet.

### Port Already in Use
```bash
Error: Port 3000 already in use
```
**Solution**: Either kill the process using the port or change the port:
```bash
PORT=3001 node server.js
```

## Project Structure Details

### Chaincode (`chaincode/stablecoin-js/`)
- **index.js**: Exports the contract class for Fabric
- **lib/stablecoin-contract.js**: Main contract implementation with all transaction functions and helper methods

### REST API (`app/server/`)
- **server.js**: Express server with route definitions
- **fabric-client.js**: Fabric SDK wrapper for connecting to the network, managing identities, and submitting transactions

### Tests (`tests/chaincode/`)
- **stablecoin.test.js**: Comprehensive test suite using Mocha and Chai

### Scripts (`scripts/`)
- **deploy-chaincode.sh**: Automates the complete chaincode deployment process
- **enroll-app-user.sh**: Enrolls an application user with the CA (optional, as the server does this automatically)

## Phase 1 Limitations

This is Phase 1 with intentional simplifications:

- **Single MSP Admin**: Only Org1MSP can mint tokens
- **No Privacy**: All transactions are visible to all network participants
- **Account-Based**: Uses simple balance model (not UTXO)
- **No Transaction Fees**: No gas/fee mechanism
- **Basic Access Control**: Simple MSP-based admin check
- **No Multi-Signature**: Single signature per transaction

## Future Enhancements (Phase 2+)

Potential improvements for future phases:
- UTXO-based transaction model
- Private data collections for confidential transactions
- Multi-signature support
- Transaction fees and gas mechanism
- Role-based access control (RBAC)
- Compliance features (AML/KYC integration points)
- Atomic swaps with other assets
- Smart contract upgrades and governance

## License

Apache-2.0

## Contact

For questions or issues related to this Phase 1 prototype, please consult with your professor or project supervisor.

---

**Note**: This is a research prototype for educational purposes. It is not intended for production use without significant security hardening and testing.
