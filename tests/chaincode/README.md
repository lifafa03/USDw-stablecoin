# Stablecoin Chaincode Test Suite

This directory contains comprehensive tests for the USDw Stablecoin chaincode implementation.

## Test Files

### 1. `stablecoin-unit.test.js` - Unit Tests (Mocked Context)
**Recommended for rapid development and CI/CD**

These tests use mocked Fabric context/stub objects, allowing them to run instantly without requiring a live Hyperledger Fabric network. Perfect for:
- Local development
- Quick validation of logic
- CI/CD pipelines
- Test-driven development (TDD)

**Features:**
- ✅ Runs without network setup
- ✅ Fast execution (< 1 second)
- ✅ Tests core business logic
- ✅ No external dependencies

### 2. `stablecoin.test.js` - Integration Tests (Live Network)
**Recommended for pre-production validation**

These tests connect to a live Fabric network and exercise the chaincode in a real environment. Required for:
- End-to-end validation
- Network interaction testing
- Pre-production verification
- Performance testing

**Requirements:**
- ✅ Running Fabric network (test-network)
- ✅ Deployed chaincode
- ✅ Enrolled users and certificates

---

## Quick Start

### Run Unit Tests (No Network Required)

```bash
# Navigate to test directory
cd tests/chaincode

# Install dependencies
npm install

# Run unit tests
npm run test:unit
```

**Expected output:**
```
  Stablecoin Chaincode - Unit Tests (Mocked Context)
    Test Vector: Mint -> Transfer -> Burn Sequence
      ✓ Step 1: Should mint 1000 units to central_bank
      ✓ Step 2: Should transfer 200 units from central_bank to user1
      ✓ Step 3: Should burn 100 units from user1
      ✓ Step 4: Should verify complete state after all operations
    Error Handling: Insufficient Balance
      ✓ Should fail to transfer more than available balance
      ✓ Should fail to burn more than available balance
      ...
  
  68 passing (123ms)
```

---

## Detailed Instructions

### Unit Tests (Mocked - Recommended)

#### Prerequisites
- Node.js 16+ and npm 8+
- No Fabric network required

#### Installation
```bash
cd tests/chaincode
npm install
```

#### Run Tests
```bash
# Run only unit tests
npm run test:unit

# With verbose output
npx mocha stablecoin-unit.test.js --reporter spec

# Run specific test suite
npx mocha stablecoin-unit.test.js --grep "Test Vector"
```

---

### Integration Tests (Live Network)

#### Prerequisites
1. **Start the Fabric test network:**
   ```bash
   cd fabric-samples/test-network
   ./network.sh up createChannel -c mychannel -ca
   ```

2. **Deploy the stablecoin chaincode:**
   ```bash
   cd ../../  # Return to project root
   ./scripts/deploy-chaincode.sh
   ```

3. **Verify deployment:**
   ```bash
   docker ps  # Should show peer, orderer, and CA containers
   ```

#### Run Integration Tests
```bash
cd tests/chaincode
npm install
npm run test:integration
```

---

## Test Coverage

### Core Functionality Tests
- ✅ **Initialization**: Ledger setup with zero supply
- ✅ **Minting**: Token creation by admin
- ✅ **Transfers**: Peer-to-peer token movement
- ✅ **Burning**: Token destruction
- ✅ **Balance Queries**: Account balance retrieval
- ✅ **Total Supply**: Circulating token tracking

### Test Vectors (As Specified)
```javascript
// Scenario 1: Mint 1000 units to central_bank
// Expected: central_bank balance = 1000, totalSupply = 1000

// Scenario 2: Transfer 200 units from central_bank to user1
// Expected: central_bank = 800, user1 = 200, totalSupply = 1000

// Scenario 3: Burn 100 units from user1
// Expected: central_bank = 800, user1 = 100, totalSupply = 900

// Scenario 4: Verify insufficient balance error
// Expected: Transfer/burn with amount > balance throws error
```

### Error Handling Tests
- ✅ Insufficient balance (transfer & burn)
- ✅ Invalid amounts (negative, zero, non-numeric)
- ✅ Empty account IDs
- ✅ Transfer to same account
- ✅ Frozen account operations
- ✅ Non-admin permission checks

### Advanced Scenarios
- ✅ Multiple concurrent accounts
- ✅ Sequential operations consistency
- ✅ Decimal amount handling
- ✅ Large amount handling
- ✅ Double-spend prevention
- ✅ Account freezing/unfreezing

---

## NPM Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `npm run test:unit` | Runs unit tests with mocked context | Fast, no network needed |
| `npm run test:integration` | Runs integration tests on live network | Requires running Fabric network |
| `npm run test:all` | Runs both test suites | Complete validation |
| `npm test` | Alias for `test:integration` | Default test command |

---

## Test Output Examples

### Successful Test Run
```
✓ Should mint 1000 units to central_bank
    ✓ central_bank balance: 1000
    ✓ Total supply: 1000

✓ Should transfer 200 units from central_bank to user1
    ✓ central_bank balance after transfer: 800
    ✓ user1 balance after transfer: 200
    ✓ Total supply (unchanged): 1000

✓ Should burn 100 units from user1
    ✓ user1 balance after burn: 100
    ✓ central_bank balance (unchanged): 800
    ✓ Total supply after burn: 900

    Final State Summary:
    ├─ central_bank: 800 tokens
    ├─ user1: 100 tokens
    ├─ Total Supply: 900 tokens
    └─ Balance Sum = Supply: ✓
```

### Failed Test Example
```
✗ Should fail to transfer more than available balance
  AssertionError: Should have thrown an error for insufficient balance
  
✓ Correctly rejected: "Insufficient balance. Account central_bank has 1000, 
                       but tried to transfer 1001"
```

---

## Debugging Tests

### Enable Verbose Logging
```bash
# Unit tests with detailed output
DEBUG=* npm run test:unit

# Show stack traces
npm run test:unit -- --reporter json > test-results.json
```

### Run Specific Test
```bash
# Run only tests matching "mint"
npx mocha stablecoin-unit.test.js --grep "mint"

# Run only error handling tests
npx mocha stablecoin-unit.test.js --grep "Error Handling"
```

### Watch Mode (Auto-rerun on changes)
```bash
npx mocha stablecoin-unit.test.js --watch
```

---

## Continuous Integration

### GitHub Actions Example
```yaml
name: Test Stablecoin Chaincode

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
      - name: Install dependencies
        run: |
          cd tests/chaincode
          npm install
      - name: Run unit tests
        run: |
          cd tests/chaincode
          npm run test:unit
```

---

## Troubleshooting

### Issue: "Cannot find module 'fabric-contract-api'"
**Solution:**
```bash
cd tests/chaincode
npm install fabric-contract-api --save-dev
```

### Issue: Integration tests failing with "No such container"
**Solution:**
```bash
# Restart the Fabric network
cd fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca

# Redeploy chaincode
cd ../../
./scripts/deploy-chaincode.sh
```

### Issue: "Error: Insufficient balance" in unexpected places
**Solution:** Each test should be isolated. Check that `beforeEach` hooks properly reset state for unit tests, or that integration tests clean up between runs.

---

## Best Practices

1. **Run unit tests during development** - Fast feedback loop
2. **Run integration tests before committing** - Catch integration issues
3. **Run all tests before releases** - Comprehensive validation
4. **Keep tests isolated** - Each test should be independent
5. **Use descriptive test names** - Clear intent and expectations
6. **Assert all relevant state changes** - Balance, supply, frozen status

---

## Contributing

When adding new chaincode features:

1. Write unit tests first (TDD approach)
2. Implement the feature
3. Ensure unit tests pass
4. Add integration tests
5. Verify all tests pass
6. Update this README if needed

---

## License

Apache-2.0

---

## Support

For issues or questions:
- Check the main project README
- Review Hyperledger Fabric documentation
- Examine test output for detailed error messages
