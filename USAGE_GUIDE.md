# USDw Stablecoin - Complete Usage Guide

**Last Updated:** November 25, 2025  
**Version:** 1.0 (Chaincode Sequence 3)

This guide walks you through everything you need to know to run, use, and test the USDw stablecoin on Hyperledger Fabric.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Starting the Blockchain Network](#starting-the-blockchain-network)
3. [Deploying the Chaincode](#deploying-the-chaincode)
4. [Starting the REST API](#starting-the-rest-api)
5. [Using the System](#using-the-system)
6. [Running Simulations](#running-simulations)
7. [Command Reference](#command-reference)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

**TL;DR - Get everything running in 5 minutes:**

```bash
# 1. Start Fabric network (2 orgs, 1 channel, 2 peers, 1 orderer)
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca

# 2. Deploy stablecoin chaincode
cd ../..
/home/rsolipuram/stablecoin-fabric/scripts/deploy-chaincode.sh 1

# 3. Create wallet identity
cd app/server
node ../../scripts/create-wallet-identity.js

# 4. Start REST API
node server.js

# 5. Test it (in new terminal)
curl http://localhost:3000/health
```

---

## Starting the Blockchain Network

### What is the Blockchain Network?

The blockchain network consists of:
- **2 Organizations** (Org1, Org2) - represent different entities (e.g., banks)
- **2 Peers** (peer0.org1, peer0.org2) - nodes that store the blockchain ledger
- **1 Orderer** - sequences transactions and creates blocks
- **1 Channel** (mychannel) - private communication pathway for transactions

### Command: Start Network

```bash
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
```

**What this does:**
- `./network.sh up` - Starts Docker containers for peers, orderer, and CAs
- `createChannel` - Creates a channel named "mychannel"
- `-c mychannel` - Specifies the channel name
- `-ca` - Starts Certificate Authorities for identity management

**Expected Output:**
```
Creating network "fabric_test" with the default driver
Creating volume "net_orderer.example.com" with default driver
Creating volume "net_peer0.org1.example.com" with default driver
Creating volume "net_peer0.org2.example.com" with default driver
...
Channel 'mychannel' created
```

**Verify it's running:**
```bash
docker ps
```

You should see containers running:
- `orderer.example.com`
- `peer0.org1.example.com`
- `peer0.org2.example.com`
- `ca_org1`
- `ca_org2`

### Command: Stop Network

```bash
cd fabric-samples/test-network
./network.sh down
```

**What this does:**
- Stops all Docker containers
- Removes volumes (deletes all blockchain data)
- Cleans up the network

**⚠️ WARNING:** This deletes all your blockchain data! All token balances will be lost.

---

## Deploying the Chaincode

### What is Chaincode?

Chaincode is the **smart contract** that runs on the blockchain. It contains all the business logic for:
- Minting tokens (creating new tokens)
- Transferring tokens (moving tokens between accounts)
- Burning tokens (destroying tokens)
- Querying balances
- Freezing/unfreezing accounts

### Command: Deploy Chaincode (First Time)

```bash
cd /home/rsolipuram/stablecoin-fabric
./scripts/deploy-chaincode.sh 1
```

**What this does:**
1. **Packages** the chaincode into a `.tar.gz` file
2. **Installs** it on peer0.org1 and peer0.org2
3. **Approves** it for both organizations
4. **Commits** it to the channel (makes it active)

**Parameters:**
- `1` - The sequence number (version). Use `1` for first deployment, `2` for first upgrade, `3` for second upgrade, etc.

**Expected Output:**
```
================================================
  Stablecoin Chaincode Deployment Script
================================================
✓ Test network is running

Step 1: Packaging chaincode...
✓ Chaincode packaged successfully

Step 2: Installing chaincode on Org1...
✓ Chaincode installed on Org1

Step 3: Installing chaincode on Org2...
✓ Chaincode installed on Org2

Step 4: Querying installed chaincode...
✓ Package ID retrieved

Step 5: Approving chaincode for Org1...
✓ Chaincode approved for Org1

Step 6: Approving chaincode for Org2...
✓ Chaincode approved for Org2

Step 7: Committing chaincode to channel...
✓ Chaincode committed to channel

Step 8: Verifying deployment...
✓ Chaincode is ready to use!
```

### Command: Upgrade Chaincode

If you made changes to the chaincode and want to deploy the new version:

```bash
./scripts/deploy-chaincode.sh 2  # Use next sequence number
```

**Why sequence numbers?**
- Fabric tracks versions using sequence numbers
- You must increment the sequence for each upgrade
- Current production version is sequence 3

### Manual Deployment (Advanced)

If the script fails, you can deploy manually:

```bash
cd fabric-samples/test-network

# 1. Package
peer lifecycle chaincode package stablecoin.tar.gz \
  --path ../../chaincode/stablecoin-js \
  --lang node \
  --label stablecoin_1.0

# 2. Install on Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
peer lifecycle chaincode install stablecoin.tar.gz

# 3. Install on Org2
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_ADDRESS=localhost:9051
peer lifecycle chaincode install stablecoin.tar.gz

# 4. Get package ID
peer lifecycle chaincode queryinstalled

# 5. Approve for Org1 (replace PACKAGE_ID)
export CORE_PEER_LOCALMSPID="Org1MSP"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --package-id PACKAGE_ID \
  --sequence 1

# 6. Approve for Org2
export CORE_PEER_LOCALMSPID="Org2MSP"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --package-id PACKAGE_ID \
  --sequence 1

# 7. Commit
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --sequence 1 \
  --peerAddresses localhost:7051 \
  --peerAddresses localhost:9051
```

---

## Starting the REST API

### What is the REST API?

The REST API is a web server that provides HTTP endpoints to interact with the blockchain. Instead of using complex Fabric commands, you can use simple HTTP requests.

### Command: Create Wallet Identity

Before starting the API, you need to create a wallet with an identity:

```bash
cd app/server
node ../../scripts/create-wallet-identity.js
```

**What this does:**
- Creates a `wallet/` directory
- Enrolls an identity called `appUser` from Org1
- Stores the certificates and private keys needed to submit transactions

**Expected Output:**
```
Wallet path: /home/rsolipuram/stablecoin-fabric/app/server/wallet
Successfully enrolled app user "appUser" and imported it into the wallet
```

### Command: Start REST API

```bash
cd app/server
node server.js
```

**What this does:**
- Loads the connection profile (`connection-org1.json`)
- Connects to the Fabric network using the `appUser` identity
- Starts an Express.js web server on port 3000
- Exposes REST endpoints for mint, transfer, burn, etc.

**Expected Output:**
```
Initializing Fabric connection...
✓ Wallet initialized at: /home/rsolipuram/stablecoin-fabric/app/server/wallet
✓ User 'appUser' found in wallet
✓ Successfully connected to Fabric network
  Channel: mychannel
  Chaincode: stablecoin
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

### Command: Start in Background

To keep the server running even after closing the terminal:

```bash
cd app/server
node server.js > /tmp/server.log 2>&1 &
```

**What this does:**
- `> /tmp/server.log 2>&1` - Redirects output to log file
- `&` - Runs the process in the background

**Check if it's running:**
```bash
pgrep -af "node.*server.js"
```

**View logs:**
```bash
tail -f /tmp/server.log
```

**Stop background server:**
```bash
pkill -f "node.*server.js"
```

---

## Using the System

### Method 1: REST API (Recommended)

The easiest way to interact with the stablecoin.

#### Check Server Health

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "message": "Stablecoin API is running",
  "timestamp": "2025-11-25T20:00:00.000Z"
}
```

#### Mint Tokens

**What it does:** Creates new tokens and assigns them to an account. Only admin (Org1MSP) can mint.

```bash
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "central_bank",
    "amount": 1000000
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "central_bank",
    "amount": 1000000,
    "newBalance": 1000000,
    "newTotalSupply": 1000000
  },
  "timestamp": "2025-11-25T20:00:00.000Z",
  "message": "Successfully minted 1000000 tokens to central_bank"
}
```

**What happens:**
1. REST API receives your request
2. Validates that amount is an integer > 0
3. Submits transaction to Fabric network
4. Chaincode executes Mint function
5. Creates/updates account state
6. Increments total supply
7. Logs `[MINT] TxID: ..., Admin: Org1MSP, Account: central_bank, Amount: 1000000, ...`

#### Transfer Tokens

**What it does:** Moves tokens from one account to another.

```bash
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "from": "central_bank",
    "to": "commercial_bank_a",
    "amount": 100000
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "from": "central_bank",
    "to": "commercial_bank_a",
    "amount": 100000,
    "fromBalance": 900000,
    "toBalance": 100000
  },
  "timestamp": "2025-11-25T20:00:00.000Z",
  "message": "Successfully transferred 100000 tokens from central_bank to commercial_bank_a"
}
```

**What happens:**
1. Validates both accounts exist
2. Checks sender has sufficient balance
3. Checks neither account is frozen
4. Deducts from sender
5. Credits to receiver
6. Logs `[TRANSFER] TxID: ..., From: central_bank, To: commercial_bank_a, Amount: 100000, ...`

#### Burn Tokens

**What it does:** Destroys tokens permanently. Only admin (Org1MSP) can burn.

```bash
curl -X POST http://localhost:3000/burn \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "central_bank",
    "amount": 50000
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "central_bank",
    "amount": 50000,
    "newBalance": 850000,
    "newTotalSupply": 950000
  },
  "timestamp": "2025-11-25T20:00:00.000Z",
  "message": "Successfully burned 50000 tokens from central_bank"
}
```

**What happens:**
1. Checks caller is Org1MSP (admin only)
2. Validates account has sufficient balance
3. Deducts tokens from account
4. Decrements total supply
5. Logs `[BURN] TxID: ..., Admin: Org1MSP, Account: central_bank, Amount: 50000, ...`

#### Query Balance

**What it does:** Returns the current balance and frozen status of an account.

```bash
curl http://localhost:3000/balance/central_bank
```

**Response:**
```json
{
  "accountId": "central_bank",
  "balance": 850000,
  "frozen": false
}
```

#### Query Total Supply

**What it does:** Returns the total number of tokens in circulation.

```bash
curl http://localhost:3000/totalsupply
```

**Response:**
```json
{
  "totalSupply": 950000
}
```

#### Freeze Account

**What it does:** Prevents an account from sending or receiving tokens. Only admin (Org1MSP) can freeze.

```bash
curl -X POST http://localhost:3000/freeze \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "suspicious_account"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accountId": "suspicious_account",
    "frozen": true
  },
  "timestamp": "2025-11-25T20:00:00.000Z",
  "message": "Account suspicious_account frozen successfully"
}
```

#### Unfreeze Account

**What it does:** Allows a frozen account to transact again. Only admin (Org1MSP) can unfreeze.

```bash
curl -X POST http://localhost:3000/unfreeze \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "suspicious_account"
  }'
```

### Method 2: CLI (Direct Chaincode Access)

For testing and debugging, you can invoke chaincode directly using the Fabric CLI.

#### Setup Environment

```bash
cd fabric-samples/test-network

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
```

**What this does:**
- Sets up environment variables to connect to Org1's peer
- Uses Admin@org1.example.com identity (has admin privileges)

#### Invoke: Mint

```bash
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel \
  -n stablecoin \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"Mint","Args":["central_bank","1000000"]}'
```

**Command breakdown:**
- `-o localhost:7050` - Connect to orderer
- `--ordererTLSHostnameOverride orderer.example.com` - TLS hostname for orderer
- `--tls` - Use TLS encryption
- `--cafile` - Certificate authority file for orderer
- `-C mychannel` - Channel name
- `-n stablecoin` - Chaincode name
- `--peerAddresses localhost:7051` - Org1 peer address
- `--tlsRootCertFiles` - TLS cert for Org1 peer
- `--peerAddresses localhost:9051` - Org2 peer address
- `--tlsRootCertFiles` - TLS cert for Org2 peer
- `-c '{"function":"Mint","Args":["central_bank","1000000"]}'` - Function call with arguments

**Why do we need two peers?**
- Fabric's endorsement policy requires approval from multiple organizations
- Ensures no single organization can unilaterally modify the ledger

#### Query: Balance

```bash
peer chaincode query \
  -C mychannel \
  -n stablecoin \
  -c '{"function":"BalanceOf","Args":["central_bank"]}'
```

**Response:**
```json
{"accountId":"central_bank","balance":1000000,"frozen":false}
```

**Query vs Invoke:**
- **Query** - Read-only, doesn't create transactions, faster
- **Invoke** - Writes to ledger, creates transactions, requires endorsement

---

## Running Simulations

### What is the Simulation?

The Python simulation mimics a **Central Bank Digital Currency (CBDC)** system:

1. **Central Bank** mints tokens
2. **Commercial Banks** (bank_a, bank_b) receive reserves
3. **Retail Users** make payments
4. **Metrics** track performance (transactions/second, success rate, latency)

### Setup Python Environment

```bash
cd simulation
pip3 install requests
```

### Quick Test

```bash
python3 demo.py
```

**What this does:**
- Mints 100,000 tokens to demo_account
- Transfers 10,000 tokens to demo_account_2
- Queries balances
- Burns 5,000 tokens

### Full CBDC Simulation

```bash
python3 run_simulation.py
```

**Default parameters:**
- 10 retail users
- 100 random payment transactions
- 10,000,000 initial supply

**What this does:**

**Phase 1 - Initialize Central Bank:**
```
Minting 10,000,000 tokens to bank_central
✓ Central bank initialized with 10,000,000 tokens
```

**Phase 2 - Distribute to Commercial Banks:**
```
Transferring 2,000,000 tokens to bank_a
Transferring 2,000,000 tokens to bank_b
✓ Distributed 4,000,000 tokens to commercial banks
```

**Phase 3 - Distribute to Retail Users:**
```
Transferring 10,000 tokens to user_0
Transferring 10,000 tokens to user_1
...
✓ Distributed 100,000 tokens to 10 retail users
```

**Phase 4 - Retail Payments:**
```
Transfer: user_3 → user_7 (500 tokens)
Transfer: user_1 → bank_a (250 tokens)
...
✓ Completed 100/100 transactions (95.0% success rate)
```

**Phase 5 - Final Reconciliation:**
```
Central Bank Balance: 5,900,000
Bank A Balance: 2,000,250
Bank B Balance: 2,000,000
Retail User Balances: 99,750
Total Supply: 10,000,000 ✓ Conservation verified
```

**Metrics:**
```
Total Transactions:       115
Successful:               109
Failed:                   6
Success Rate:             94.78%
Duration:                 45.23s
Throughput:               2.54 tx/s
```

### Custom Simulation Parameters

```bash
# More users and transactions
python3 run_simulation.py --num-users 50 --num-transactions 500

# Smaller test
python3 run_simulation.py --num-users 5 --num-transactions 20

# Different initial supply
python3 run_simulation.py --initial-supply 1000000

# Verbose logging
python3 run_simulation.py --verbose
```

**Parameters:**
- `--num-users` - Number of retail user accounts
- `--num-transactions` - Number of payment transactions
- `--initial-supply` - Initial token supply to mint
- `--verbose` - Show detailed logging
- `--api-url` - Custom REST API URL (default: http://localhost:3000)

### Understanding Simulation Output

**Transaction Types:**

1. **Wholesale CBDC** (Central Bank → Commercial Banks)
   - Large amounts (millions)
   - Infrequent
   - Represents reserve distribution

2. **Retail CBDC** (Users ↔ Users, Users ↔ Banks)
   - Small amounts (100-1000)
   - Frequent
   - Represents everyday payments

**Metrics Explained:**

- **Total Transactions** - All operations (mint + transfers + burns)
- **Successful** - Transactions that completed without errors
- **Failed** - Transactions that were rejected (insufficient balance, frozen account, etc.)
- **Success Rate** - Percentage of successful transactions
- **Duration** - Total time to run simulation
- **Throughput** - Transactions per second (tx/s)

**Conservation Check:**

At the end, the simulation verifies:
```
SUM(all account balances) == Total Supply
```

This ensures no tokens were created or lost during transfers.

---

## Command Reference

### Network Management

| Command | Purpose |
|---------|---------|
| `./network.sh up createChannel -c mychannel -ca` | Start Fabric network with channel |
| `./network.sh down` | Stop network and delete all data |
| `docker ps` | List running containers |
| `docker logs CONTAINER_NAME` | View container logs |
| `docker logs -f CONTAINER_NAME` | Follow container logs |

### Chaincode Deployment

| Command | Purpose |
|---------|---------|
| `./scripts/deploy-chaincode.sh 1` | Deploy chaincode (sequence 1) |
| `./scripts/deploy-chaincode.sh 2` | Upgrade chaincode (sequence 2) |
| `peer lifecycle chaincode queryinstalled` | List installed chaincodes |
| `peer lifecycle chaincode querycommitted -C mychannel` | List committed chaincodes |

### REST API

| Command | Purpose |
|---------|---------|
| `node server.js` | Start API server (foreground) |
| `node server.js > /tmp/server.log 2>&1 &` | Start API server (background) |
| `pgrep -af "node.*server.js"` | Check if server is running |
| `pkill -f "node.*server.js"` | Stop server |
| `tail -f /tmp/server.log` | View server logs |

### Simulation

| Command | Purpose |
|---------|---------|
| `python3 demo.py` | Quick test |
| `python3 run_simulation.py` | Full CBDC simulation |
| `python3 run_simulation.py --num-users 50` | Custom user count |
| `python3 run_simulation.py --verbose` | Detailed logging |

### Debugging

| Command | Purpose |
|---------|---------|
| `docker logs dev-peer0.org1...` | View chaincode logs |
| `peer chaincode query -C mychannel -n stablecoin -c '{"function":"GetAllAccounts","Args":[]}'` | List all accounts |
| `curl http://localhost:3000/health` | Check API health |

---

## Troubleshooting

### Issue: "No such container"

**Symptom:**
```
docker logs: No such container: dev-peer0.org1...
```

**Cause:** Network not started or chaincode not deployed.

**Solution:**
```bash
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
cd ../..
./scripts/deploy-chaincode.sh 1
```

### Issue: "Connection refused"

**Symptom:**
```
Error: Connection refused (localhost:3000)
```

**Cause:** REST API not running.

**Solution:**
```bash
cd app/server
node server.js
```

### Issue: "No valid responses from any peers"

**Symptom:**
```
{"success":false,"error":"No valid responses from any peers. Errors:"}
```

**Cause:** Known issue with Node.js SDK and cryptogen certificates.

**Workaround:** Use CLI commands instead:
```bash
peer chaincode invoke -o localhost:7050 ... -c '{"function":"Mint","Args":["account","1000"]}'
```

### Issue: "Amount must be an integer"

**Symptom:**
```
Error: Amount must be an integer (no decimals allowed)
```

**Cause:** You tried to use decimal amounts (e.g., 100.5).

**Solution:** Use whole numbers only:
```bash
# ✗ Wrong
curl ... -d '{"amount": 100.5}'

# ✓ Correct
curl ... -d '{"amount": 100}'
```

### Issue: "Only admin (Org1MSP) can perform this operation"

**Symptom:**
```
Error: Only admin (Org1MSP) can perform this operation. Current MSP: Org2MSP
```

**Cause:** Tried to mint/burn from non-admin organization.

**Solution:** Use Org1MSP identity:
```bash
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
```

### Issue: "Insufficient balance"

**Symptom:**
```
Error: Insufficient balance: account has 500 but tried to transfer 1000
```

**Cause:** Account doesn't have enough tokens.

**Solution:** Check balance first:
```bash
curl http://localhost:3000/balance/account_id
```

### Issue: "Account is frozen"

**Symptom:**
```
Error: Account central_bank is frozen and cannot transact
```

**Cause:** Account was frozen by admin.

**Solution:** Unfreeze the account:
```bash
curl -X POST http://localhost:3000/unfreeze \
  -H "Content-Type: application/json" \
  -d '{"accountId": "central_bank"}'
```

---

## Advanced Usage

### View Chaincode Logs

```bash
# Find chaincode container name
docker ps | grep stablecoin

# View logs
docker logs dev-peer0.org1.example.com-stablecoin_1.0-PACKAGE_ID

# Follow logs in real-time
docker logs -f dev-peer0.org1.example.com-stablecoin_1.0-PACKAGE_ID
```

**What you'll see:**
```
[MINT] TxID: 97b0cae8..., Admin: Org1MSP, Account: central_bank, Amount: 1000000, ...
[TRANSFER] TxID: a3f5b21c..., From: central_bank, To: bank_a, Amount: 100000, ...
[BURN] TxID: 0d682434..., Admin: Org1MSP, Account: central_bank, Amount: 50000, ...
```

### Monitor Network Performance

```bash
# Watch container stats
docker stats

# Check peer logs
docker logs -f peer0.org1.example.com

# Check orderer logs
docker logs -f orderer.example.com
```

### Backup Blockchain Data

```bash
# Stop network
cd fabric-samples/test-network
./network.sh down

# Backup volumes
docker run --rm -v fabric_peer0.org1.example.com:/data -v $(pwd):/backup alpine tar czf /backup/peer0-org1-backup.tar.gz /data

# Restore (if needed)
docker run --rm -v fabric_peer0.org1.example.com:/data -v $(pwd):/backup alpine tar xzf /backup/peer0-org1-backup.tar.gz -C /
```

---

## Next Steps

1. **Explore the Code**
   - `chaincode/stablecoin-js/lib/stablecoin-contract.js` - Smart contract logic
   - `app/server/server.js` - REST API implementation
   - `simulation/run_simulation.py` - CBDC simulation

2. **Read Documentation**
   - `PROJECT_OVERVIEW.md` - System architecture
   - `PRODUCTION_UPGRADES.md` - Recent improvements
   - `TROUBLESHOOTING.md` - Common issues

3. **Experiment**
   - Create custom accounts
   - Test freeze/unfreeze functionality
   - Run large-scale simulations
   - Monitor performance metrics

4. **Integrate**
   - Build a web UI
   - Connect to external systems
   - Implement custom business logic

---

**Need Help?**

- Check `TROUBLESHOOTING.md` for common issues
- View container logs: `docker logs CONTAINER_NAME`
- Check API logs: `tail -f /tmp/server.log`
- Verify network status: `docker ps`

**Documentation:**
- `PROJECT_OVERVIEW.md` - Complete system documentation
- `PREREQUISITES.md` - Installation requirements
- `PRODUCTION_UPGRADES.md` - Latest features
- `QUICKSTART.md` - Quick reference guide

---

**Last Updated:** November 25, 2025  
**Version:** 1.0 (Chaincode Sequence 3)  
**Repository:** https://github.com/lifafa03/USDw-stablecoin
