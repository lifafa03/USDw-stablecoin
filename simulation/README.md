# OpenCBDC-Style Stablecoin Simulation

This directory contains a Python-based simulation layer that mimics an OpenCBDC (Open Central Bank Digital Currency) system using the Hyperledger Fabric stablecoin as the underlying distributed ledger.

## 📋 Overview

The simulation demonstrates a realistic CBDC payment system with:
- **Central Bank** - Issues digital currency tokens
- **Commercial Banks** - Hold reserves and facilitate payments
- **Retail Users** - Make peer-to-peer payments
- **Distributed Ledger** - Hyperledger Fabric for settlement

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Python Simulation Layer                     │
│  (OpenCBDC-style payment system simulation)                 │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼────────────────────────────────────────┐
│              Node.js/Express REST API                        │
│  (localhost:3000 - API Gateway)                             │
└────────────────────┬────────────────────────────────────────┘
                     │ Fabric SDK
┌────────────────────▼────────────────────────────────────────┐
│          Hyperledger Fabric Test Network                     │
│  - Stablecoin Chaincode (stablecoincc)                      │
│  - 2 Organizations (Org1, Org2)                             │
│  - Orderer + 2 Peers                                        │
└──────────────────────────────────────────────────────────────┘
```

## 📁 Files

### `stablecoin_client.py`
Python client library that wraps the REST API endpoints:
- `mint(account_id, amount)` - Create new tokens
- `transfer(from, to, amount)` - Transfer tokens
- `burn(account_id, amount)` - Destroy tokens
- `get_balance(account_id)` - Query balance
- `get_total_supply()` - Query total supply
- Includes error handling, retry logic, and logging

### `run_simulation.py`
Main simulation script that:
1. **Initializes** the central bank with initial token supply
2. **Distributes** reserves to commercial banks
3. **Allocates** balances to retail users
4. **Simulates** retail payment transactions
5. **Collects** metrics (throughput, latency, success rate)
6. **Verifies** token conservation and final balances

### `requirements.txt`
Python dependencies (minimal - only `requests` library required)

## 🚀 Quick Start

### Prerequisites

1. **Hyperledger Fabric Network Running**
   ```bash
   cd fabric-samples/test-network
   ./network.sh up createChannel -c mychannel
   ```

2. **Stablecoin Chaincode Deployed**
   ```bash
   ./network.sh deployCC -ccn stablecoin -ccp ../../chaincode/stablecoin-js -ccl javascript -cci InitLedger
   ```

3. **REST API Server Running**
   ```bash
   cd app/server
   npm install
   node server.js
   # Server should be running on http://localhost:3000
   ```

### Installation

```bash
# Navigate to simulation directory
cd simulation

# Install Python dependencies
pip install -r requirements.txt

# Or use pip3 if needed
pip3 install -r requirements.txt
```

### Running the Simulation

**Basic Usage:**
```bash
python run_simulation.py
```

**With Custom Parameters:**
```bash
# Run with 500 transactions and 20 users
python run_simulation.py --num-transactions 500 --num-users 20

# Run with verbose logging
python run_simulation.py --verbose

# Run with custom API URL
python run_simulation.py --api-url http://localhost:8000

# Run with larger initial supply
python run_simulation.py --initial-supply 50000000
```

**Help:**
```bash
python run_simulation.py --help
```

## 📊 Simulation Flow

### Phase 1: Central Bank Initialization
```
Central Bank (bank_central)
    └─> Mint 10,000,000 tokens
```

### Phase 2: Distribution to Commercial Banks
```
Central Bank (bank_central)
    ├─> Transfer 3,000,000 to Bank A (bank_a)
    └─> Transfer 3,000,000 to Bank B (bank_b)
Remaining: 4,000,000 in Central Bank reserves
```

### Phase 3: Distribution to Retail Users
```
Bank A / Bank B
    ├─> Transfer 100-1000 to user_000
    ├─> Transfer 100-1000 to user_001
    └─> ... (all retail users)
```

### Phase 4: Retail Payments Simulation
```
Random transfers between retail users:
    user_005 -> user_018: 23.45 tokens
    user_012 -> user_003: 47.89 tokens
    ... (100 transactions by default)
```

## 📈 Output Metrics

The simulation provides comprehensive metrics:

### Transaction Metrics
- Total transactions executed
- Successful vs failed transactions
- Success rate (%)

### Performance Metrics
- Total duration (seconds)
- Throughput (transactions/second)
- Average latency (milliseconds)
- Median latency
- Min/Max latency

### Final State
- Central bank balance
- Commercial bank balances
- Sample user balances
- Total supply
- Token conservation verification

## 🔍 Example Output

```
================================================================================
SIMULATION RESULTS
================================================================================

📊 Transaction Metrics:
  Total Transactions:      100
  Successful:              98
  Failed:                  2
  Success Rate:            98.00%

⚡ Performance Metrics:
  Total Duration:          45.234s
  Throughput:              2.17 tx/s
  Average Latency:         450.23ms
  Median Latency:          425.18ms
  Min Latency:             234.12ms
  Max Latency:             1245.67ms

💰 Final Account Balances:
  bank_central                  4,000,000.00
  bank_a                        2,456,789.12
  bank_b                        2,543,210.88

  Sample User Balances (first 5):
  user_000                           654.32
  user_001                           432.10
  user_002                           789.45
  user_003                           234.67
  user_004                           891.23

🪙 Total Supply:
  Total Supply:            10,000,000.00
  Initial Supply:          10,000,000.00
  Difference:              0.00

✅ Token Conservation Check:
  Central Bank:            4,000,000.00
  Commercial Banks:        5,000,000.00
  Retail Users:            1,000,000.00
  Calculated Total:        10,000,000.00
  Blockchain Total Supply: 10,000,000.00
  ✓ Balances match! Token conservation verified.

================================================================================
Simulation completed successfully!
================================================================================
```

## 🎛️ Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--api-url` | `http://localhost:3000` | REST API base URL |
| `--num-users` | 10 | Number of retail user accounts |
| `--num-transactions` | 100 | Number of payment transactions |
| `--initial-supply` | 10,000,000 | Initial token supply |
| `--verbose` | False | Enable verbose logging |

## 🧪 Testing the Client

Test the client library independently:
```bash
python stablecoin_client.py
```

This runs basic tests on all API endpoints.

## 🐛 Troubleshooting

### "API server is not accessible"
- Verify Fabric network is running: `docker ps`
- Check REST API server: `curl http://localhost:3000/health`
- Check server logs: `cat app/server/server.log`

### "Connection refused"
- Ensure REST API server is started
- Verify port 3000 is not in use: `lsof -i :3000`

### "Transaction failed" errors
- Check chaincode logs: `docker logs <chaincode-container>`
- Verify chaincode is properly deployed
- Check if accounts have sufficient balance

### Low throughput
- Fabric test-network has limited performance
- Reduce `num-transactions` for faster testing
- Add delays between transactions if needed

## 📚 Related Files

- Chaincode: `../../chaincode/stablecoin-js/`
- REST API: `../../app/server/`
- Fabric Network: `../../fabric-samples/test-network/`

## 🔗 Integration with OpenCBDC

This simulation provides a compatible architecture for:
- **Transaction processing** - Similar to OpenCBDC's transaction manager
- **Ledger settlement** - Using Hyperledger Fabric instead of OpenCBDC's UTXO
- **Bank coordination** - Commercial banks as intermediaries
- **Metrics collection** - Performance monitoring like OpenCBDC

## 🚀 Future Enhancements

Potential extensions:
- Add privacy features (confidential transactions)
- Implement atomic swaps between CBDCs
- Add fraud detection simulation
- Multi-currency support
- Network partition simulation
- Byzantine fault injection
- Performance benchmarking suite

## 📄 License

Apache-2.0 (same as Hyperledger Fabric)

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Enhanced metrics visualization
- More realistic payment patterns
- Integration tests
- Performance optimizations
- Additional simulation scenarios

---

**Note:** This is a simulation/testing tool. For production CBDC systems, additional security, compliance, and scalability considerations are required.
