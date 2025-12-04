# GENUSD Retail Payment Simulation Engine (Phase 4A)

A comprehensive simulation framework to test GENUSD stablecoin under retail payment volumes (100-5000 concurrent transactions) with UTXO fragmentation, traffic patterns, and performance metrics.

## Overview

This simulation engine validates that GENUSD can handle real-world retail payment scenarios with:
- **Realistic user base**: 100+ test users with varying KYC levels and balances
- **High transaction volume**: 1000-5000 randomized transfers
- **Traffic patterns**: Uniform, burst (DDoS), and Zipf distribution (heavy hitters)
- **UTXO fragmentation**: Users have 5-10 UTXOs to simulate realistic wallet states
- **Performance metrics**: Latency (avg/p90/p95/p99), throughput, supply invariants

## Architecture

```
sim/retail/
├── src/
│   ├── usergen.ts        # User Generator (deterministic seed)
│   ├── payment-sim.ts    # Payment Simulation Engine
│   ├── metrics.ts        # Metrics Analyzer
│   └── index.ts          # Main Orchestration
├── package.json
├── tsconfig.json
└── README.md

sim/results/
├── users.json            # Generated test users
├── transactions.json     # Raw transaction results
├── summary.json          # Metrics in JSON format
└── summary.md            # Markdown report with tables
```

## Quick Start

### 1. Install Dependencies

```bash
cd sim/retail
npm install
npm run build
```

### 2. Run Full Simulation (Default)

```bash
npm run sim
```

This runs:
- **User Generation**: 100 test users
- **Payment Simulation**: 1000 transactions (uniform pattern)
- **Metrics Analysis**: Full performance report

### 3. View Results

```bash
cat ../results/summary.md
```

## Usage

### Run with Custom Parameters

```bash
# 200 users, 5000 transactions, burst pattern
npm run sim -- -u 200 -t 5000 -p burst

# Zipf distribution (80/20 rule - heavy hitters)
npm run sim -- -u 500 -t 3000 -p zipf

# Use existing users, run new payment simulation
npm run sim -- --skip-users -t 2000
```

### Individual Steps

```bash
# Generate users only
npm run generate-users

# Run payment simulation (requires users.json)
NUM_TX=2000 PATTERN=burst npm run run-payments

# Analyze existing data
npm run analyze
```

### CLI Options

```
Options:
  -u, --users <n>         Number of test users (default: 100)
  -t, --transactions <n>  Number of transactions (default: 1000)
  -p, --pattern <type>    Traffic pattern: uniform|burst|zipf (default: uniform)
  -s, --seed <string>     Random seed for reproducibility
  --skip-users            Skip user generation (use existing users.json)
  --skip-payments         Skip payment simulation (use existing transactions.json)
  --skip-analysis         Skip metrics analysis
  --analyze-only          Only run analysis on existing data
  -h, --help              Show this help message
```

## Traffic Patterns

### Uniform Random
Random sender/receiver pairs, evenly distributed across all users.
```bash
npm run sim -- -p uniform
```

### Burst (DDoS Simulation)
Sudden spikes of 50 transactions at once, simulating DDoS scenarios.
```bash
npm run sim -- -p burst -t 2000
```

### Zipf Distribution (Heavy Hitters)
80% of transactions from top 20% of users (power law distribution).
```bash
npm run sim -- -p zipf -t 3000
```

## Metrics Collected

### Transaction Summary
- Total transactions (attempted/successful/failed)
- Success rate percentage

### Latency Metrics
- Average latency
- Min/Max latency
- P50, P90, P95, P99 percentiles
- ASCII histogram of latency distribution

### Throughput
- Total simulation duration
- Transactions per second (TPS)

### Supply Invariant Check
- Expected total supply
- Actual total supply from blockchain
- Verification: Σ(all UTXOs) == chaincode total supply

### Error Analysis
- Total failed transactions
- Error types with counts
- Retry statistics

### Bottleneck Detection
Automatic analysis of:
- Low success rates (< 95%)
- High latency (> 1000ms avg)
- Tail latency issues (P99 > 5000ms)
- Low throughput (< 10 TPS)
- Supply mismatches

## Output Files

### `results/users.json`
Generated test users with:
- User IDs (User_00000 - User_00099)
- KYC levels (None/Basic/Enhanced/Institutional)
- Initial balances (1000-1000000 USDw)
- UTXO IDs
- Governance tags

### `results/transactions.json`
Raw transaction results:
- Transaction ID
- Sender/receiver user IDs
- Amount transferred
- Timestamp
- Latency (ms)
- Success/failure status
- Error messages (if failed)

### `results/summary.json`
Structured metrics:
```json
{
  "total_transactions": 1000,
  "successful": 987,
  "failed": 13,
  "success_rate": 98.7,
  "latency": {
    "avg_ms": 456,
    "p90_ms": 678,
    "p95_ms": 789,
    "p99_ms": 1234
  },
  "throughput": {
    "txs_per_second": 23.4
  }
}
```

### `results/summary.md`
Human-readable Markdown report with:
- Tables for all metrics
- Latency histogram (ASCII)
- Bottleneck analysis
- Recommendations

## Implementation Details

### User Generator (`usergen.ts`)
- **Deterministic generation**: Uses `seedrandom` for reproducibility
- **KYC distribution**: 40% Basic, 30% Enhanced, 20% None, 10% Institutional
- **UTXO fragmentation**: 5-10 UTXOs per user with random amounts
- **Pre-minting**: Uses `SimpleMint` chaincode function
- **Fabric integration**: Connects to mychannel, uses Admin@org1 identity

### Payment Simulator (`payment-sim.ts`)
- **Multi-input/output UTXOs**: Realistic UTXO selection
- **Fabric Gateway SDK**: Uses `fabric-network` 2.2.20
- **Retry logic**: 3 attempts per transaction with exponential backoff
- **Concurrent execution**: Configurable batch size (default 10)
- **Latency measurement**: High-precision timestamps

### Metrics Analyzer (`metrics.ts`)
- **Percentile calculation**: Accurate P50/P90/P95/P99 via sorted array
- **Supply verification**: Queries `GetTotalSupply()` from chaincode
- **ASCII histogram**: Visual latency distribution
- **Colored output**: Uses `chalk` for terminal formatting
- **Tables**: `cli-table3` for professional console output

## Prerequisites

### Fabric Network
- Hyperledger Fabric 2.5.4 test-network running
- Channel: `mychannel`
- Chaincode: `genusd` (with SimpleMint/SimpleTransfer functions)
- Identity: Admin@org1.example.com in wallet

### Connection Profile
`app/server/connection-org1-with-channel.json` must exist with:
```json
{
  "channels": {
    "mychannel": {
      "peers": {
        "peer0.org1.example.com": { "endorsingPeer": true },
        "peer0.org2.example.com": { "endorsingPeer": true }
      }
    }
  }
}
```

## Troubleshooting

### "Cannot find users.json"
```bash
npm run generate-users
```

### "Failed to connect to Fabric"
Check:
1. Fabric test-network is running: `docker ps`
2. Connection profile exists: `app/server/connection-org1-with-channel.json`
3. Wallet has Admin identity: `app/server/wallet/`

### "Transaction failed: insufficient balance"
Users need pre-minted balances. Run:
```bash
npm run generate-users  # This also pre-mints
```

### High Failure Rate
- Check chaincode logs: `docker logs peer0.org1.example.com`
- Verify KYC/governance policies allow transfers
- Reduce `--transactions` to test smaller loads

## Performance Benchmarks

Expected performance on Fabric test-network (1 orderer, 2 peers):

| Metric | Expected Range |
|--------|----------------|
| Success Rate | > 95% |
| Avg Latency | 300-800ms |
| P95 Latency | < 2000ms |
| Throughput | 10-30 TPS |

These benchmarks assume:
- Default endorsement policy (2-of-2)
- Local test-network (not distributed)
- No network congestion

## Next Steps (Phase 4B)

After completing the retail simulation (Phase 4A), Phase 4B will implement:

1. **Real STARK Integration**: Replace placeholder STARK verification
2. **Module-SIS Commitments**: Replace Pedersen with post-quantum lattice-based commitments
3. **Confidential Mode**: Amount hiding with homomorphic properties
4. **CouchDB Indexing**: Optimize UTXO range queries
5. **Audit APIs**: Compliance and transaction history endpoints
6. **Observability**: Prometheus metrics, Grafana dashboards

## License

Part of the GENUSD Post-Quantum Stablecoin project.

## Support

For issues or questions:
1. Check simulation logs in console output
2. Review `results/summary.md` for bottleneck analysis
3. Inspect `results/transactions.json` for failed transaction details
