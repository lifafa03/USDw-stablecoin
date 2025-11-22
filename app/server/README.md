# Stablecoin REST API Server

Express-based REST API for interacting with the Stablecoin chaincode on Hyperledger Fabric using Node SDK v2.x.

## Architecture

```
Client (curl/frontend) → Express Server → Fabric SDK → Gateway → Channel → Chaincode
                                            ↓
                                         Wallet (identities)
                                            ↓
                                    Connection Profile (network topology)
```

## Prerequisites

- **Hyperledger Fabric test-network**: Running with `stablecoincc` chaincode deployed
- **Node.js**: v16 or higher
- **npm**: v8 or higher

## Installation

```bash
cd app/server
npm install
```

This installs:
- `express` - Web framework
- `body-parser` - JSON parsing
- `fabric-network` - Fabric Node SDK v2.x
- `fabric-ca-client` - Certificate Authority client
- `cors` - Cross-origin support
- `morgan` - HTTP request logging

## Configuration

The server automatically configures itself based on:

### Connection Profile
- **Location**: `../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json`
- **Contains**: Network topology, peer endpoints, CA information, TLS certificates

### Wallet
- **Location**: `./wallet/` (created automatically)
- **Type**: File system wallet
- **Contains**: User identities (X.509 certificates)

### Identity
- **User**: `appUser`
- **Organization**: Org1 (Org1MSP)
- **Registration**: Automatic on first start

### Chaincode
- **Name**: `stablecoincc` (must match deployment)
- **Channel**: `mychannel`

## Starting the Server

### Standard Mode
```bash
node server.js
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

Expected output:
```
✓ Wallet initialized at: /path/to/wallet
✓ User 'appUser' found in wallet
✓ Successfully connected to Fabric network
  Channel: mychannel
  Chaincode: stablecoincc
  Identity: appUser (Org1MSP)

================================================
  Stablecoin REST API Server
================================================
Server running on port 3000

Available endpoints:
  GET    /health
  POST   /mint              - { accountId, amount }
  POST   /transfer          - { from, to, amount }
  POST   /burn              - { accountId, amount }
  GET    /balance/:accountId
  GET    /totalsupply
  GET    /history/:accountId
  POST   /freeze            - { accountId }
  POST   /unfreeze          - { accountId }
================================================
```

## API Endpoints

### Health Check
```bash
GET /health
```
Returns server status.

**Response:**
```json
{
  "status": "ok",
  "service": "Stablecoin REST API",
  "timestamp": "2025-11-20T10:30:00.000Z",
  "uptime": 123.456
}
```

---

### Mint Tokens
```bash
POST /mint
Content-Type: application/json

{
  "accountId": "alice",
  "amount": 1000
}
```

Creates new tokens and adds to account. **Admin only** (enforced by chaincode).

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "amount": 1000,
    "newBalance": 1000,
    "newTotalSupply": 1000
  },
  "message": "Successfully minted 1000 tokens to alice"
}
```

---

### Transfer Tokens
```bash
POST /transfer
Content-Type: application/json

{
  "from": "alice",
  "to": "bob",
  "amount": 250
}
```

Transfers tokens between accounts.

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "alice",
    "to": "bob",
    "amount": 250,
    "fromBalance": 750,
    "toBalance": 250
  },
  "message": "Successfully transferred 250 tokens from alice to bob"
}
```

---

### Burn Tokens
```bash
POST /burn
Content-Type: application/json

{
  "accountId": "alice",
  "amount": 100
}
```

Destroys tokens from an account.

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "amount": 100,
    "newBalance": 650,
    "newTotalSupply": 900
  },
  "message": "Successfully burned 100 tokens from alice"
}
```

---

### Get Balance
```bash
GET /balance/alice
```

Queries account balance and status. Returns 0 for non-existent accounts.

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "balance": 650,
    "frozen": false
  }
}
```

---

### Get Total Supply
```bash
GET /totalsupply
```

Queries total token supply.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSupply": 900
  }
}
```

---

### Get Account History
```bash
GET /history/alice
```

Retrieves transaction history for an account.

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "history": [
      {
        "txId": "abc123...",
        "timestamp": "2025-11-20T10:00:00.000Z",
        "isDelete": false,
        "balance": 1000,
        "frozen": false
      },
      {
        "txId": "def456...",
        "timestamp": "2025-11-20T10:05:00.000Z",
        "isDelete": false,
        "balance": 750,
        "frozen": false
      }
    ]
  }
}
```

---

### Freeze Account
```bash
POST /freeze
Content-Type: application/json

{
  "accountId": "alice"
}
```

Freezes an account (prevents transfers). **Admin only**.

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "frozen": true,
    "balance": 650
  },
  "message": "Successfully froze account alice"
}
```

---

### Unfreeze Account
```bash
POST /unfreeze
Content-Type: application/json

{
  "accountId": "alice"
}
```

Unfreezes an account. **Admin only**.

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "alice",
    "frozen": false,
    "balance": 650
  },
  "message": "Successfully unfroze account alice"
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description",
  "timestamp": "2025-11-20T10:30:00.000Z"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 403 | Forbidden (permission denied, frozen account) |
| 404 | Not Found (invalid endpoint) |
| 409 | Conflict (MVCC conflict) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (network down) |
| 504 | Gateway Timeout |

### Common Errors

**Invalid Input:**
```json
{
  "success": false,
  "error": "Amount must be a positive number"
}
```

**Insufficient Balance:**
```json
{
  "success": false,
  "error": "Insufficient balance. Account alice has 100, but tried to transfer 200"
}
```

**Permission Denied:**
```json
{
  "success": false,
  "error": "Permission denied. This operation requires admin privileges."
}
```

**Frozen Account:**
```json
{
  "success": false,
  "error": "Account alice is frozen"
}
```

**Network Unavailable:**
```json
{
  "success": false,
  "error": "Cannot connect to Fabric network. Please ensure the network is running."
}
```

## Testing the API

### Using curl

```bash
# Mint tokens
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{"accountId": "alice", "amount": 1000}'

# Transfer tokens
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "alice", "to": "bob", "amount": 250}'

# Check balance
curl http://localhost:3000/balance/alice

# Check total supply
curl http://localhost:3000/totalsupply
```

### Using Postman

1. Import collection: Create requests for each endpoint
2. Set base URL: `http://localhost:3000`
3. Set Content-Type: `application/json`
4. Test each operation in sequence

## Fabric SDK v2.x Patterns

### Gateway Pattern
The server uses the Gateway pattern from Fabric SDK v2.x:

```javascript
const gateway = new Gateway();
await gateway.connect(connectionProfile, {
    wallet: wallet,
    identity: 'appUser',
    discovery: { enabled: true, asLocalhost: true }
});

const network = await gateway.getNetwork('mychannel');
const contract = network.getContract('stablecoincc');
```

### Submit vs Evaluate Transactions

**Submit (Write Operations):**
- `contract.submitTransaction(function, ...args)`
- Goes through full endorsement → ordering → commit cycle
- Used for: Mint, Transfer, Burn, Freeze, Unfreeze

**Evaluate (Read Operations):**
- `contract.evaluateTransaction(function, ...args)`
- Queries single peer, no ledger write
- Used for: BalanceOf, TotalSupply, GetAccountHistory

### Identity Management

The server automatically:
1. Creates file system wallet
2. Enrolls admin (if needed)
3. Registers application user (if needed)
4. Stores X.509 certificates in wallet

### Service Discovery

Enabled with `discovery: { enabled: true, asLocalhost: true }`:
- Automatically discovers peers and orderers
- Handles peer selection for endorsements
- Maps Docker network addresses to localhost

## Troubleshooting

### Server won't start

**Error:** `Connection profile not found`
```bash
# Ensure test-network is running
cd ../../fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
```

**Error:** `Cannot connect to Fabric network`
```bash
# Verify chaincode is deployed
peer lifecycle chaincode querycommitted --channelID mychannel --name stablecoincc
```

### Permission errors

**Error:** `Permission denied. This operation requires admin privileges`
- Only Org1MSP can mint tokens and freeze/unfreeze accounts
- The server uses Org1 identity by default

### Wallet issues

To reset the wallet:
```bash
rm -rf wallet/
# Restart server to recreate wallet and enroll user
node server.js
```

### View server logs

The server logs all:
- Incoming HTTP requests (via morgan)
- Fabric SDK operations
- Transaction results
- Detailed error information

## Production Considerations

For production deployment:

1. **Environment Variables**: Configure via env vars
   ```bash
   export CHANNEL_NAME=mychannel
   export CHAINCODE_NAME=stablecoincc
   export PORT=3000
   ```

2. **TLS**: Enable HTTPS
3. **Authentication**: Add JWT/OAuth for API auth
4. **Rate Limiting**: Prevent abuse
5. **Monitoring**: Add metrics and health checks
6. **Wallet Security**: Use HSM or cloud KMS
7. **Error Handling**: More detailed logging
8. **Connection Pooling**: Reuse gateway connections

## File Structure

```
app/server/
├── package.json          # Dependencies
├── server.js             # Express server with routes
├── fabric-client.js      # Fabric SDK v2.x integration
├── wallet/               # Identity storage (auto-generated)
│   ├── admin.id
│   └── appUser.id
└── README.md             # This file
```

## Additional Resources

- [Hyperledger Fabric Docs](https://hyperledger-fabric.readthedocs.io/)
- [Node SDK Documentation](https://hyperledger.github.io/fabric-sdk-node/)
- [Connection Profile Spec](https://hyperledger-fabric.readthedocs.io/en/latest/developapps/connectionprofile.html)
- [Gateway Pattern](https://hyperledger-fabric.readthedocs.io/en/latest/developapps/gateway.html)
