# Common Issues & Troubleshooting

## "Org1 Failed to Connect" Error

### Symptom
```
Error: Failed to connect to org1
Error: Wallet not found
Error: No admin identity found
```

### Root Cause
The certificates and wallet are **not included in the repository** (for security reasons). They must be generated locally on each developer's machine.

### Solution

**Step 1: Verify Prerequisites**
```bash
# Check Docker is running
docker ps

# Should return container list (may be empty, that's OK)
# If error, start Docker Desktop or Docker daemon
```

**Step 2: Start Fabric Network**
```bash
cd fabric-samples/test-network

# Clean any previous network
./network.sh down

# Start fresh network
./network.sh up createChannel -c mychannel
```

**Expected Output:**
```
Creating network "fabric_test" with the default driver
Creating peer0.org1.example.com ... done
Creating peer0.org2.example.com ... done
Creating orderer.example.com    ... done
Channel 'mychannel' created
```

**Step 3: Deploy Stablecoin Chaincode**
```bash
# Still in test-network directory
./network.sh deployCC \
  -ccn stablecoin \
  -ccp ../../chaincode/stablecoin-js \
  -ccl javascript \
  -cci InitLedger
```

**Expected Output:**
```
Chaincode installed successfully on peer0.org1
Chaincode installed successfully on peer0.org2
Chaincode committed successfully
```

**Step 4: Create Admin Wallet**
```bash
cd ../../scripts
./create-admin-wallet.sh
```

**Expected Output:**
```
Creating wallet directory...
Copying Admin identity from org1...
✓ Admin wallet created successfully at: ../app/server/wallet
```

**Verify wallet exists:**
```bash
ls -la ../app/server/wallet/
# Should show: Admin@org1.example.com.id
```

**Step 5: Install Dependencies and Start Server**
```bash
cd ../app/server
npm install
node server.js
```

**Expected Output:**
```
Stablecoin REST API Server
Server running on http://localhost:3000
Connected to Fabric network successfully
```

---

## Other Common Issues

### Issue: "Port already in use"
**Error:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000
# Or
netstat -tlnp | grep :3000

# Kill the process
kill -9 <PID>

# Or change port in server.js
```

### Issue: "Docker containers not starting"
**Error:** `ERROR: Cannot start service peer0.org1.example.com`

**Solution:**
```bash
# Clean everything
cd fabric-samples/test-network
./network.sh down
docker system prune -a
docker volume prune -f

# Restart Docker
sudo systemctl restart docker  # Linux
# Or restart Docker Desktop on Mac/Windows

# Try again
./network.sh up createChannel -c mychannel
```

### Issue: "Chaincode installation failed"
**Error:** `Error: chaincode install failed with status: 500`

**Solution:**
```bash
# Check chaincode syntax
cd chaincode/stablecoin-js
npm install
npm test  # If tests exist

# Ensure package.json is correct
cat package.json

# Try deploying again
cd ../../fabric-samples/test-network
./network.sh deployCC -ccn stablecoin -ccp ../../chaincode/stablecoin-js -ccl javascript
```

### Issue: "Cannot find module 'fabric-network'"
**Error:** `Error: Cannot find module 'fabric-network'`

**Solution:**
```bash
cd app/server
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Permission denied" when running scripts
**Error:** `bash: ./create-admin-wallet.sh: Permission denied`

**Solution:**
```bash
chmod +x scripts/*.sh
./scripts/create-admin-wallet.sh
```

### Issue: REST API works but simulation fails
**Error:** `No valid responses from any peers. Errors:`

**Known Issue:** The REST API has Fabric SDK connection issues with cryptogen certificates.

**Workaround:** Use CLI-based simulation:
```bash
cd simulation
python3 demo.py
```

This uses peer CLI commands directly instead of the REST API.

---

## Verification Checklist

Before asking for help, verify:

**1. Docker is running:**
```bash
docker ps
# Should show 5+ containers (orderer, 2 peers, 2 chaincodes)
```

**2. Network is healthy:**
```bash
docker logs peer0.org1.example.com | tail -20
# Should not show continuous errors
```

**3. Chaincode is installed:**
```bash
cd fabric-samples/test-network
export PATH=$PWD/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=$PWD/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$PWD/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode queryinstalled
# Should show stablecoin package
```

**4. Wallet exists:**
```bash
ls app/server/wallet/
# Should show: Admin@org1.example.com.id
```

**5. Test chaincode directly:**
```bash
# Query total supply (should work even if REST API doesn't)
peer chaincode query -C mychannel -n stablecoin -c '{"function":"TotalSupply","Args":[]}'
```

If this works but REST API doesn't, use the CLI-based simulation.

---

## Clean Slate (Nuclear Option)

If nothing works, start completely fresh:

```bash
# Stop everything
cd fabric-samples/test-network
./network.sh down

# Remove all Docker artifacts
docker rm -f $(docker ps -aq) 2>/dev/null
docker volume prune -f
docker network prune -f

# Remove generated files
rm -rf organizations channel-artifacts log.txt
cd ../..
rm -rf app/server/wallet

# Start fresh
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel
./network.sh deployCC -ccn stablecoin -ccp ../../chaincode/stablecoin-js -ccl javascript -cci InitLedger
cd ../../scripts
./create-admin-wallet.sh
cd ../app/server
npm install
node server.js
```

---

## Getting Help

If still stuck:

1. **Check logs:**
   ```bash
   docker logs peer0.org1.example.com
   docker logs orderer.example.com
   cat app/server/server.log
   ```

2. **Verify Prerequisites:**
   ```bash
   ./check-prerequisites.sh
   ```

3. **Check network configuration:**
   ```bash
   docker network inspect fabric_test
   ```

4. **Test with peer CLI instead of REST API:**
   ```bash
   cd simulation
   python3 demo.py
   ```

---

**Last Updated:** November 24, 2025
