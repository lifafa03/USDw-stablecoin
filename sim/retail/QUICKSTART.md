# Quick Start: Running the Retail Simulation

## Prerequisites Check

Before running the simulation, verify:

```bash
# 1. Fabric network is running
docker ps | grep hyperledger

# 2. Chaincode is deployed
docker logs peer0.org1.example.com 2>&1 | grep "Chaincode genusd"

# 3. Admin identity exists in wallet
ls -la app/server/wallet/Admin@org1.example.com/
```

## Run Simulation (Default)

```bash
cd /home/rsolipuram/stablecoin-fabric/sim/retail
npm run sim
```

This will:
1. Generate 100 test users
2. Pre-mint initial balances on blockchain
3. Execute 1000 randomized transfers (uniform pattern)
4. Analyze performance metrics
5. Generate reports in `../results/`

## View Results

```bash
# View Markdown report
cat ../results/summary.md

# View JSON metrics
cat ../results/summary.json

# View raw transaction data
cat ../results/transactions.json | jq '.transactions | length'
```

## Alternative Scenarios

### Large-Scale Test (5000 Transactions)
```bash
npm run sim -- -u 200 -t 5000 -p burst
```

### Heavy Hitters (Zipf Distribution)
```bash
npm run sim -- -u 500 -t 3000 -p zipf
```

### Re-analyze Existing Data
```bash
npm run sim -- --analyze-only
```

## Troubleshooting

### Error: "Failed to connect to Fabric"
```bash
# Check network is running
cd /home/rsolipuram/stablecoin-fabric/fabric-samples/test-network
./network.sh status

# If not running, start it:
./network.sh up createChannel
cd /home/rsolipuram/stablecoin-fabric
./scripts/deploy-chaincode.sh
```

### Error: "Cannot find users.json"
```bash
# Generate users first
cd sim/retail
npm run generate-users
```

### Error: "Transaction failed: insufficient balance"
Users need pre-minted balances. The user generator does this automatically, but if you're using existing users.json, you may need to manually mint:

```bash
# Check if users have balances
cd /home/rsolipuram/stablecoin-fabric
curl http://localhost:3001/balance/User_00000
```

## Expected Output

```
╔═══════════════════════════════════════════════════════╗
║   GENUSD Retail Payment Simulation (Phase 4A)      ║
╚═══════════════════════════════════════════════════════╝

Configuration:
  Users: 100
  Transactions: 1000
  Traffic Pattern: UNIFORM
  Seed: genusd-retail-sim-2025

━━━ STEP 1: User Generation ━━━

Generating 100 test users...
Seed: genusd-retail-sim-2025
✓ Generated 100 users

User Statistics:
  Total Users: 100
  KYC Distribution:
    Basic: 40
    Enhanced: 30
    None: 20
    Institutional: 10
  Total Initial Balance: 52500000 USDw
  Average Balance: 525000 USDw

✓ Connected to Fabric network

Pre-minting initial balances...
  Minted balances for 10/100 users
  Minted balances for 20/100 users
  ...
✓ Pre-minting complete: 100 success, 0 failed

✓ Users saved to: .../results/users.json
✓ User generation complete

━━━ STEP 2: Payment Simulation ━━━

Loading users from .../results/users.json...
✓ Loaded 100 users
✓ Connected to Fabric network

=== Payment Simulation Start ===
Traffic Pattern: UNIFORM
Transactions: 1000
Users: 100

Running UNIFORM pattern: 1000 transactions
  Progress: 10.0% (100 txs)
  Progress: 20.0% (200 txs)
  ...
✓ Simulation complete in 42.5s
✓ Results saved to: .../results/transactions.json
✓ Payment simulation complete

━━━ STEP 3: Metrics Analysis ━━━

Loading transaction results from .../results/transactions.json...
✓ Loaded 1000 transaction results

Computing metrics...
✓ Metrics computed

=== SIMULATION METRICS ===

┌─────────────────────────────┬────────────────────┐
│ Metric                      │ Value              │
├─────────────────────────────┼────────────────────┤
│ Total Transactions          │ 1000               │
│ Successful                  │ 987                │
│ Failed                      │ 13                 │
│ Success Rate                │ 98.70%             │
└─────────────────────────────┴────────────────────┘

┌─────────────────────────────┬────────────────────┐
│ Latency Metric              │ Value (ms)         │
├─────────────────────────────┼────────────────────┤
│ Average                     │ 456                │
│ Minimum                     │ 123                │
│ Maximum                     │ 2345               │
│ P50 (Median)                │ 432                │
│ P90                         │ 678                │
│ P95                         │ 789                │
│ P99                         │ 1234               │
└─────────────────────────────┴────────────────────┘

┌─────────────────────────────┬────────────────────┐
│ Throughput Metric           │ Value              │
├─────────────────────────────┼────────────────────┤
│ Duration (s)                │ 42.5               │
│ TPS                         │ 23.4               │
└─────────────────────────────┴────────────────────┘

┌─────────────────────────────┬────────────────────┐
│ Supply Check                │ Value              │
├─────────────────────────────┼────────────────────┤
│ Expected Supply             │ 2086231            │
│ Actual Supply               │ 2086231            │
│ Matches                     │ ✓ YES              │
└─────────────────────────────┴────────────────────┘

LATENCY DISTRIBUTION:
123-345ms    | ████████████████████████████████████ 350
345-567ms    | ██████████████████████████████ 300
567-789ms    | ████████████████████ 200
789-1011ms   | ████████████ 120
1011-1233ms  | ████████ 80
1233-1455ms  | ████ 40
1455-1677ms  | ██ 20
1677-1899ms  | █ 10
1899-2121ms  | █ 5
2121-2343ms  | █ 2

✓ Metrics saved to: .../results/summary.json
✓ Markdown report saved to: .../results/summary.md
✓ Metrics analysis complete

✅ SIMULATION COMPLETE (85.2s)

📊 Results Location:
  /home/rsolipuram/stablecoin-fabric/sim/results/
    ├── users.json           (Generated test users)
    ├── transactions.json     (Raw transaction results)
    ├── summary.json          (Metrics in JSON format)
    └── summary.md            (Markdown report)
```

## Next Steps After Running

1. **Review Performance Metrics**
   ```bash
   cat ../results/summary.md
   ```

2. **Check for Bottlenecks**
   Look for warnings in the bottleneck analysis section:
   - ⚠️ Low success rate (< 95%)
   - ⚠️ High latency (> 1000ms)
   - ⚠️ Low throughput (< 10 TPS)
   - 🚨 Supply mismatches

3. **Re-run with Different Parameters**
   Try different scenarios:
   - More users: `-u 500`
   - More transactions: `-t 5000`
   - Different pattern: `-p burst` or `-p zipf`

4. **Compare Results**
   Run multiple times with different seeds and compare:
   ```bash
   npm run sim -- --seed run1
   mv ../results/summary.json ../results/summary-run1.json
   
   npm run sim -- --seed run2
   mv ../results/summary.json ../results/summary-run2.json
   ```

5. **Move to Phase 4B**
   Once satisfied with simulation results, proceed to Phase 4B implementation:
   - Real STARK integration
   - Module-SIS commitments
   - Confidential mode
   - CouchDB indexing
   - Audit APIs
   - Observability

## Success Criteria

The simulation is successful if:
- ✅ Success rate > 95%
- ✅ Average latency < 1000ms
- ✅ P99 latency < 3000ms
- ✅ Supply invariant matches
- ✅ No critical errors in logs

If any criteria fail, investigate:
1. Fabric network logs: `docker logs peer0.org1.example.com`
2. Chaincode logs: `docker logs -f dev-peer0.org1.example.com-genusd_1.1-...`
3. Transaction error messages in `transactions.json`
