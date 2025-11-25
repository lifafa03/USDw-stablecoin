# USDw Stablecoin - Complete Usage Guide

**Last Updated:** November 25, 2025  
**Version:** 1.0 (Chaincode Sequence 3)  
**Platform:** Linux Server (Ubuntu/Debian)

This guide walks you through everything you need to know to run, use, and test the USDw stablecoin on Hyperledger Fabric on a Linux server.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 0: Clone the Repository](#step-0-clone-the-repository)
3. [Step 1: Start the Blockchain Network](#step-1-start-the-blockchain-network)
4. [Step 2: Deploy the Chaincode](#step-2-deploy-the-chaincode)
5. [Step 3: Start the REST API](#step-3-start-the-rest-api)
6. [Step 4: Run Simulations](#step-4-run-simulations)
7. [Using the System (Advanced)](#using-the-system-advanced)
8. [Command Reference](#command-reference)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **Linux Server** (Ubuntu 20.04+ or Debian 11+)
- ✅ **Docker & Docker Compose** installed and running
- ✅ **Node.js v16+** and npm installed
- ✅ **Python 3.8+** installed
- ✅ **Git** installed
- ✅ **curl** installed
- ✅ **User has Docker permissions** (in docker group)

**Check prerequisites on your Linux server:**
```bash
# Check OS
cat /etc/os-release

# Check Docker
docker --version          # Should show Docker version 20.10+
docker ps                 # Should connect without sudo

# Check Docker Compose
docker-compose --version  # Should show version 1.29+

# Check Node.js and npm
node --version           # Should show v16.0.0 or higher
npm --version            # Should show 8.0.0 or higher

# Check Python
python3 --version        # Should show Python 3.8.0 or higher
pip3 --version          # Should be installed

# Check Git
git --version           # Should show git version

# Check curl
curl --version          # Should be installed
```

**If Docker requires sudo:**
```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and log back in, OR run:
newgrp docker

# Verify (should work without sudo)
docker ps
```

**Install missing prerequisites (Ubuntu/Debian):**
```bash
# Update package list
sudo apt update

# Install Docker
sudo apt install -y docker.io docker-compose

# Install Node.js 18.x (recommended)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python and pip
sudo apt install -y python3 python3-pip

# Install Git and curl
sudo apt install -y git curl

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 0: Clone the Repository

### Clone from GitHub

```bash
# Navigate to your home directory
cd ~

# Clone the repository
git clone https://github.com/lifafa03/USDw-stablecoin.git

# Rename to stablecoin-fabric (if needed)
mv USDw-stablecoin stablecoin-fabric

# Navigate into the project
cd stablecoin-fabric

# Verify you have all files
ls -la
```

**Expected output:**
```
drwxr-xr-x  app/
drwxr-xr-x  chaincode/
drwxr-xr-x  scripts/
drwxr-xr-x  simulation/
drwxr-xr-x  tests/
-rw-r--r--  README.md
-rw-r--r--  USAGE_GUIDE.md
...
```

**Note:** You won't see `fabric-samples/` yet - we'll install it in the next step.

### Install Hyperledger Fabric Samples & Binaries

```bash
# Navigate to project root
cd ~/stablecoin-fabric

# Download Fabric samples, binaries, and Docker images (v2.5.0)
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5

# This will create a fabric-samples/ directory with:
# - test-network/ (network setup scripts)
# - bin/ (peer, orderer, configtxgen binaries)
# - config/ (configuration files)
# - Docker images (peer, orderer, CA, tools)
```

**What this does:**
- Downloads Fabric binaries (`peer`, `orderer`, `configtxgen`, etc.)
- Pulls Docker images (hyperledger/fabric-peer, fabric-orderer, fabric-ca)
- Creates `fabric-samples/` directory with test network and examples
- Takes 2-5 minutes depending on your internet speed

**Expected output (abbreviated):**
```
Clone hyperledger/fabric-samples repo

===> Downloading platform specific fabric binaries
===> Downloading:  https://github.com/hyperledger/fabric/releases/download/v2.5.0/...

===> Pulling fabric Images
===> Pulling fabric-peer:2.5.0
===> Pulling fabric-orderer:2.5.0
===> Pulling fabric-ca:1.5.5
...

===> List out hyperledger docker images
hyperledger/fabric-peer       2.5.0
hyperledger/fabric-orderer    2.5.0
hyperledger/fabric-ca         1.5.5
```

**Verify installation:**
```bash
# Check fabric-samples directory exists
ls -la ~/stablecoin-fabric/fabric-samples/

# Check binaries are installed
ls -la ~/stablecoin-fabric/fabric-samples/bin/

# Check Docker images
docker images | grep hyperledger
```

### Install Node.js Dependencies

```bash
# Install chaincode dependencies
cd ~/stablecoin-fabric/chaincode/stablecoin-js
npm install

# Install server dependencies
cd ~/stablecoin-fabric/app/server
npm install

# Install Python dependencies
cd ~/stablecoin-fabric/simulation
pip3 install requests

# Return to project root
cd ~/stablecoin-fabric
```

### Set Project Path Variable (Optional but Recommended)

```bash
# Add to your ~/.bashrc for convenience
echo 'export STABLECOIN_HOME=~/stablecoin-fabric' >> ~/.bashrc
source ~/.bashrc

# Now you can use $STABLECOIN_HOME anywhere
echo $STABLECOIN_HOME
```

---

## Step 1: Start the Blockchain Network

### What You're Starting

The blockchain network consists of:
- **2 Organizations** (Org1, Org2) - Different entities like banks
- **2 Peers** (peer0.org1, peer0.org2) - Store the blockchain ledger
- **1 Orderer** - Sequences transactions into blocks
- **1 Channel** (mychannel) - Private communication pathway

### Commands (Copy & Run)

```bash
# Verify Docker is running (should show empty table or existing containers)
docker ps

# Navigate to test-network directory
cd ~/stablecoin-fabric/fabric-samples/test-network

# Start the network (this takes 2-3 minutes)
./network.sh up createChannel -c mychannel -ca
```

### What This Does

1. **Starts Docker containers** for peers, orderer, and certificate authorities
2. **Creates cryptographic materials** (certificates, keys) for identities
3. **Creates channel** named "mychannel"
4. **Joins peers** to the channel

### Expected Output

```
Creating network "fabric_test" with the default driver
Creating volume "net_orderer.example.com" with default driver
Creating volume "net_peer0.org1.example.com" with default driver
Creating volume "net_peer0.org2.example.com" with default driver
...
Channel 'mychannel' created
Peer peer0.org1.example.com joined the channel 'mychannel'
Peer peer0.org2.example.com joined the channel 'mychannel'
```

### Verify It's Running

```bash
# Check if 5 containers are running
docker ps

# You should see these containers:
# - orderer.example.com
# - peer0.org1.example.com  
# - peer0.org2.example.com
# - ca_org1
# - ca_org2
```

**✅ SUCCESS:** If you see all 5 containers with status "Up", proceed to Step 2.

**❌ ERROR:** If containers aren't running, see [Troubleshooting](#troubleshooting).

---

## Step 2: Deploy the Chaincode

### What You're Deploying

**Chaincode** is the smart contract that runs on the blockchain. It contains:
- **Mint** - Create new tokens (admin only)
- **Transfer** - Move tokens between accounts
- **Burn** - Destroy tokens (admin only)
- **BalanceOf** - Query account balance
- **TotalSupply** - Query total tokens in circulation
- **FreezeAccount** / **UnfreezeAccount** - Admin controls

### Commands (Copy & Run)

```bash
# Navigate to project root
cd ~/stablecoin-fabric

# Deploy chaincode (sequence 1 for first deployment)
./scripts/deploy-chaincode.sh 1

# Note: Use sequence 2 for first upgrade, sequence 3 for second upgrade, etc.
```

### What This Does

1. **Packages** the chaincode (creates `.tar.gz` file)
2. **Installs** on peer0.org1 and peer0.org2
3. **Approves** for both organizations
4. **Commits** to mychannel (makes it active)
5. **Starts chaincode containers**

### Expected Output

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
Package ID: stablecoin_1.0:c646068d89152b2e...
✓ Package ID retrieved

Step 5: Approving chaincode for Org1...
✓ Chaincode approved for Org1

Step 6: Approving chaincode for Org2...
✓ Chaincode approved for Org2

Step 7: Committing chaincode to channel...
✓ Chaincode committed to channel

Step 8: Verifying deployment...
✓ Chaincode is ready to use!

================================================
Deployment completed successfully!
================================================
```

### Verify Deployment

```bash
# Check if chaincode containers are running
docker ps | grep stablecoin

# You should see 2 new containers:
# - dev-peer0.org1.example.com-stablecoin_1.0-...
# - dev-peer0.org2.example.com-stablecoin_1.0-...
```

**✅ SUCCESS:** If you see chaincode containers running, proceed to Step 3.

**❌ ERROR:** If deployment failed, see [Manual Deployment](#manual-chaincode-deployment-advanced).

---

## Step 3: Start the REST API

### What You're Starting

The **REST API** is a web server that provides HTTP endpoints to interact with the blockchain:
- No need to use complex Fabric commands
- Simple HTTP requests (curl, Postman, or any programming language)
- Runs on port 3000

### Step 3a: Create Wallet Identity (One-Time Setup)

**What this does:**
This script creates a wallet directory and enrolls an application user identity (`appUser`) from Organization 1. This identity is used by the REST API to submit transactions to the blockchain.

**Why it's needed:**
Every interaction with the Hyperledger Fabric network requires a valid identity with certificates and private keys. The wallet stores these credentials securely.

```bash
# Navigate to server directory
cd ~/stablecoin-fabric/app/server

# Run the wallet creation script
node ../../scripts/create-wallet-identity.js
```

**Expected output:**
```
Connecting to Fabric CA...
✓ Successfully enrolled admin user
✓ Registered and enrolled app user "appUser"
Wallet path: /home/YOUR_USERNAME/stablecoin-fabric/app/server/wallet
Successfully enrolled app user "appUser" and imported it into the wallet
```

**What just happened:**
1. Script connected to the Certificate Authority (CA) for Org1
2. Enrolled an admin identity first (needed for user registration)
3. Registered a new user called `appUser` with the CA
4. Enrolled `appUser` and received certificates + private key
5. Saved credentials to `app/server/wallet/` directory
6. Created `appUser.id` file containing the identity

**Verify wallet was created:**
```bash
# Check wallet directory exists
ls -la ~/stablecoin-fabric/app/server/wallet

# You should see:
# drwxr-xr-x  wallet/
#   └── appUser.id (identity file with certificates)
```

**Troubleshooting:**
- **Error: "ECONNREFUSED"** → CA container not running. Go back to Step 1 and verify network is up.
- **Error: "Wallet already exists"** → Already created. Safe to proceed to Step 3b.
- **Error: "Cannot find module"** → Run `npm install` in `app/server/` directory.

---

### Step 3b: Start the REST API Server

```bash
# Make sure you're in server directory
cd ~/stablecoin-fabric/app/server

# Start the server (runs in foreground)
node server.js
```

**Expected output:**
```
Initializing Fabric connection...
Connecting to Fabric network...
✓ Wallet initialized at: /home/YOUR_USERNAME/stablecoin-fabric/app/server/wallet
✓ User 'appUser' found in wallet
Connection profile loaded from: .../connection-org1.json
✓ Successfully connected to Fabric network
  Channel: mychannel
  Chaincode: stablecoin
  Identity: appUser (Org1MSP)
Connected to Fabric network

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

**Keep this terminal open!** The server needs to stay running.

### Verify API is Running

**Open a NEW terminal (SSH session)** and test:

```bash
# Test API health endpoint
curl http://localhost:3000/health
```

**Expected response:**
```json
{"status":"healthy","message":"Stablecoin API is running"}
```

✅ **SUCCESS:** If you get this response, proceed to Step 4.

❌ **ERROR:** If connection fails:
- Check server terminal for errors
- Verify network is running: `docker ps` (should see 7 containers)
- Verify chaincode is deployed: `docker ps | grep stablecoin`

---

### Optional: Run Server in Background (Linux Server Best Practice)

If you want to run the server in the background and continue using your terminal:

```bash
# Stop the foreground server first (Press Ctrl+C in server terminal)

# Start in background using nohup (keeps running after logout)
cd ~/stablecoin-fabric/app/server
nohup node server.js > /tmp/stablecoin-server.log 2>&1 &

# Alternative: Use screen (allows reattaching)
screen -S stablecoin-api
cd ~/stablecoin-fabric/app/server
node server.js
# Press Ctrl+A then D to detach
# To reattach later: screen -r stablecoin-api

# Alternative: Use tmux (similar to screen)
tmux new -s stablecoin-api
cd ~/stablecoin-fabric/app/server
node server.js
# Press Ctrl+B then D to detach
# To reattach later: tmux attach -t stablecoin-api
```

**Manage background server:**
```bash
# View logs (nohup method)
tail -f /tmp/stablecoin-server.log

# Check if server is running
ps aux | grep "node.*server.js"
# OR
lsof -i :3000

# Stop background server
pkill -f "node.*server.js"
# OR (if you have the process ID)
kill PID_NUMBER
```

**Recommended for Linux servers:** Use `tmux` or `screen` so you can easily reattach and see live logs.

---

## Step 4: Run Simulations

Now that everything is running, let's test it!

---

### Option A: Quick Demo (2 minutes)

**Test basic operations:**

```bash
# Navigate to simulation directory
cd ~/stablecoin-fabric/simulation

# Run quick demo
python3 demo.py
```

**What this does:**
1. Mints 100,000 tokens to `demo_account`
2. Transfers 10,000 tokens to `demo_account_2`
3. Queries both balances
4. Burns 5,000 tokens from `demo_account`
5. Queries final total supply

**Expected output:**
```
================================================
  Stablecoin Demo - Quick Test
================================================

Step 1: Mint 100,000 tokens to demo_account
✓ Minted successfully
  New Balance: 100,000
  New Total Supply: 100,000

Step 2: Transfer 10,000 tokens
✓ Transfer successful
  From balance: 90,000
  To balance: 10,000

Step 3: Query balances
demo_account balance: 90,000
demo_account_2 balance: 10,000

Step 4: Burn 5,000 tokens
✓ Burn successful
  New balance: 85,000
  New total supply: 95,000

Step 5: Query total supply
Total Supply: 95,000

================================================
Demo completed successfully!
================================================
```

**✅ SUCCESS:** If all steps complete, your system is fully operational!

---

### Option B: Full CBDC Simulation (5-10 minutes)

**Simulate a real Central Bank Digital Currency system:**

```bash
# Navigate to simulation directory
cd ~/stablecoin-fabric/simulation

# Run full simulation
python3 run_simulation.py
```

**What this simulates:**

**Phase 1 - Initialize Central Bank:**
```
[Phase 1] Initialize Central Bank
----------------------------------------
Minting 10,000,000 tokens to bank_central
✓ Central bank initialized with 10,000,000 tokens
```

**Phase 2 - Distribute to Commercial Banks:**
```
[Phase 2] Distribute to Commercial Banks
----------------------------------------
Transferring 2,000,000 tokens to bank_a
Transferring 2,000,000 tokens to bank_b
✓ Distributed 4,000,000 tokens to commercial banks
```

**Phase 3 - Distribute to Retail Users:**
```
[Phase 3] Distribute to Retail Users
----------------------------------------
Transferring 10,000 tokens to user_0
Transferring 10,000 tokens to user_1
...
✓ Distributed 100,000 tokens to 10 retail users
```

**Phase 4 - Retail Payment Simulation:**
```
[Phase 4] Retail Payment Simulation
----------------------------------------
Transaction 1/100: user_3 → user_7 (500 tokens) ✓
Transaction 2/100: user_1 → bank_a (250 tokens) ✓
Transaction 3/100: user_5 → user_2 (1000 tokens) ✓
...
✓ Completed 100/100 transactions (95.0% success rate)
```

**Phase 5 - Final Reconciliation:**
```
[Phase 5] Final Reconciliation
----------------------------------------
Central Bank Balance:        5,900,000
Bank A Balance:              2,000,250
Bank B Balance:              2,000,000
Retail User Total:              99,750
Total Supply:               10,000,000 ✓

✓ Conservation verified: All tokens accounted for!
```

**Metrics:**
```
================================================================================
  SIMULATION METRICS
================================================================================
  Total Transactions:       115
  Successful:               109
  Failed:                   6
  Success Rate:             94.78%
  Duration:                 45.23s
  Throughput:               2.54 tx/s
================================================================================

  CLIENT TRANSACTION METRICS
================================================================================
  Total Transactions:       115
  Successful:               109
  Failed:                   6
  Success Rate:             94.78%
  Duration:                 45.23s
  Throughput:               2.54 tx/s
================================================================================
```

---

### Option C: Custom Simulation

**Customize the simulation parameters:**

```bash
# Navigate to simulation directory
cd ~/stablecoin-fabric/simulation

# More users and transactions
python3 run_simulation.py --num-users 50 --num-transactions 500

# Smaller test (faster)
python3 run_simulation.py --num-users 5 --num-transactions 20

# Different initial supply
python3 run_simulation.py --initial-supply 1000000

# Verbose logging (see every detail)
python3 run_simulation.py --verbose

# Combine multiple parameters
python3 run_simulation.py --num-users 20 --num-transactions 200 --verbose
```

**Available parameters:**
- `--num-users N` - Number of retail user accounts (default: 10)
- `--num-transactions N` - Number of payment transactions (default: 100)
- `--initial-supply N` - Initial tokens to mint (default: 10,000,000)
- `--verbose` - Show detailed logging for every operation
- `--api-url URL` - Custom REST API URL (default: http://localhost:3000)

---

### Understanding Simulation Results

**Transaction Types:**

1. **Wholesale CBDC** (Central Bank → Commercial Banks)
   - Large amounts (millions of tokens)
   - Represents reserve distribution
   - Example: Central bank gives 2M tokens to Bank A

2. **Retail CBDC** (Users ↔ Users, Users ↔ Banks)
   - Small amounts (100-1000 tokens)
   - Represents everyday payments
   - Example: User pays 500 tokens to merchant

**Why Some Transactions Fail:**

- **Insufficient balance** - User tries to spend more than they have
- **Account frozen** - Admin froze the account
- **Invalid amount** - Decimal amounts are rejected (integers only)
- **Concurrent updates** - Two transactions try to update same account simultaneously

**This is normal!** A 90-95% success rate is expected in real-world scenarios.

**Conservation Check:**

At the end, the simulation verifies:
```
SUM(all balances) == Total Supply
```

This ensures no tokens were created or lost during transfers.

---

## Quick Start Summary

**Complete setup in 5 copy-paste commands:**

```bash
# 1. Start blockchain network
cd ~/stablecoin-fabric/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca

# 2. Deploy chaincode
cd ~/stablecoin-fabric
./scripts/deploy-chaincode.sh 1

# 3. Create wallet
cd ~/stablecoin-fabric/app/server
node ../../scripts/create-wallet-identity.js

# 4. Start REST API (in background)
node server.js > /tmp/server.log 2>&1 &

# 5. Run simulation
cd ~/stablecoin-fabric/simulation
python3 run_simulation.py
```

**That's it!** Your USDw stablecoin is now running on Hyperledger Fabric. 🚀

---

## Using the System (Advanced)

This section covers manual interaction methods for advanced users.

### Manual Chaincode Deployment (Advanced)

If the automated script fails, you can deploy manually:

```bash
# Navigate to test-network
cd ~/stablecoin-fabric/fabric-samples/test-network

# Set up environment variables
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp

# 1. Package chaincode
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
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
peer lifecycle chaincode install stablecoin.tar.gz

# 4. Get package ID (copy the Package ID from output)
peer lifecycle chaincode queryinstalled

# 5. Set the package ID (replace with your actual package ID from step 4)
export PACKAGE_ID=stablecoin_1.0:PUT_YOUR_PACKAGE_ID_HERE

# 6. Approve for Org2
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_ADDRESS=localhost:9051
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence 1

# 7. Approve for Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence 1

# 8. Commit chaincode definition
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --channelID mychannel \
  --name stablecoin \
  --version 1.0 \
  --sequence 1 \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
```

---

### Method 1: REST API Operations

Use these endpoints to manually interact with the stablecoin via HTTP requests.

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

#### Setup Environment (Copy & Run Once)

```bash
# Navigate to test-network
cd ~/stablecoin-fabric/fabric-samples/test-network

# Set environment variables for Org1 Admin
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
```

#### CLI Command: Mint Tokens

```bash
# Mint 1,000,000 tokens to central_bank account
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

#### CLI Command: Transfer Tokens

```bash
# Transfer 100,000 tokens from central_bank to commercial_bank_a
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
  -c '{"function":"Transfer","Args":["central_bank","commercial_bank_a","100000"]}'
```

#### CLI Command: Query Balance

```bash
# Query balance of central_bank account
peer chaincode query \
  -C mychannel \
  -n stablecoin \
  -c '{"function":"BalanceOf","Args":["central_bank"]}'
```

#### CLI Command: Query Total Supply

```bash
# Query total supply of tokens
peer chaincode query \
  -C mychannel \
  -n stablecoin \
  -c '{"function":"TotalSupply","Args":[]}'
```

#### CLI Command: Burn Tokens

```bash
# Burn 50,000 tokens from central_bank account (admin only)
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
  -c '{"function":"Burn","Args":["central_bank","50000"]}'
```

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
