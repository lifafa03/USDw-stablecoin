# Quick Start Guide

## Initial Setup (One-Time)

```bash
# 1. Navigate to project directory
cd /home/rsolipuram/stablecoin-fabric

# 2. Start Fabric test-network
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca

# 3. Install chaincode dependencies
cd ../../chaincode/stablecoin-js
npm install

# 4. Deploy chaincode
cd ../../scripts
./deploy-chaincode.sh

# 5. Install REST API dependencies
cd ../app/server
npm install

# 6. Start the REST API server
node server.js
```

## Daily Usage

### Start Everything
```bash
# Terminal 1: Start network (if not already running)
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca

# Terminal 2: Start REST API
cd /home/rsolipuram/stablecoin-fabric/app/server
node server.js
```

### Stop Everything
```bash
# Stop REST API: Ctrl+C in the server terminal

# Stop network
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network
./network.sh down
```

## Common Commands

### API Testing
```bash
# Mint tokens
curl -X POST http://localhost:3000/mint \
  -H "Content-Type: application/json" \
  -d '{"accountId": "alice", "amount": 1000}'

# Check balance
curl http://localhost:3000/balance/alice

# Transfer
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "alice", "to": "bob", "amount": 250}'

# Check total supply
curl http://localhost:3000/totalsupply
```

### Run Tests
```bash
cd /home/rsolipuram/stablecoin-fabric/tests/chaincode
npm install  # First time only
npm test
```

### Redeploy Chaincode (After Changes)
```bash
# 1. Update version in scripts/deploy-chaincode.sh
#    - Increment CHAINCODE_VERSION (e.g., "1.0" to "1.1")
#    - Increment CHAINCODE_SEQUENCE (e.g., 1 to 2)

# 2. Deploy
cd /home/rsolipuram/stablecoin-fabric/scripts
./deploy-chaincode.sh

# 3. Restart REST API
# Ctrl+C the running server, then:
cd /home/rsolipuram/stablecoin-fabric/app/server
node server.js
```

## Project Paths

- **Project Root**: `/home/rsolipuram/stablecoin-fabric`
- **Chaincode**: `/home/rsolipuram/stablecoin-fabric/chaincode/stablecoin-js`
- **REST API**: `/home/rsolipuram/stablecoin-fabric/app/server`
- **Tests**: `/home/rsolipuram/stablecoin-fabric/tests/chaincode`
- **Scripts**: `/home/rsolipuram/stablecoin-fabric/scripts`
- **Test Network**: `/home/rsolipuram/stablecoin-fabric/fabric-samples/test-network`

## Troubleshooting Quick Fixes

### Network won't start
```bash
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network
./network.sh down
docker system prune -f
./network.sh up createChannel -c mychannel -ca
```

### Fresh restart
```bash
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca
cd ../../scripts
./deploy-chaincode.sh
```

### Server connection issues
```bash
# Clear wallet and restart
cd /home/rsolipuram/stablecoin-fabric/app/server
rm -rf wallet/
node server.js
```
