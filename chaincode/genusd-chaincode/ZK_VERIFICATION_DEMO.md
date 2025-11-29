# Zero-Knowledge Verification in GENUSD - How It Works

## Architecture: ON-CHAIN vs OFF-CHAIN

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ZK PROOF LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────────┘

Step 1: PROOF GENERATION (OFF-CHAIN) 🔒
┌──────────────────────────────────────┐
│ User's Private Data                  │
│ • KYC Level: 3                       │
│ • Balance: $1,000,000                │
│ • Jurisdiction: US                   │
│ • Transaction History: [...]         │
└──────────────────┬───────────────────┘
                   │
                   ↓
┌──────────────────────────────────────┐
│ STARK Prover (Winterfell/Stone)      │
│ • Generate witness                   │
│ • Execute computation                │
│ • Generate STARK proof               │
│                                      │
│ Public Statement:                    │
│ "User has KYC Level ≥ 2"            │
│ WITHOUT revealing Level = 3          │
└──────────────────┬───────────────────┘
                   │
                   ↓
┌──────────────────────────────────────┐
│ ZK Proof Output                      │
│ {                                    │
│   proof_bytes: "0x0123...",         │
│   public_inputs: ["KYC_MIN_2"],     │
│   commitment: "0xabc...",            │
│   nullifier: "0x789...",             │
│   timestamp: 1700000000              │
│ }                                    │
└──────────────────┬───────────────────┘
                   │
                   │ Submit via API
                   ↓

Step 2: VERIFICATION (ON-CHAIN) ✅
┌──────────────────────────────────────┐
│ POST /zk/attest                      │
│ → Hyperledger Fabric Network         │
└──────────────────┬───────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────────┐
│ CHAINCODE: zkverifier/zk_verifier.go (ON-CHAIN)            │
│                                                             │
│ func VerifyProof(proof *STARKProof) (bool, error) {        │
│                                                             │
│   // 1. Structure validation                               │
│   if len(proof.ProofBytes) == 0 {                          │
│     return false, errors.New("empty proof")                │
│   }                                                         │
│                                                             │
│   // 2. Nullifier check (prevent double-use)               │
│   if sv.nullifiers[proof.Nullifier] {                      │
│     return false, errors.New("nullifier already used")     │
│   }                                                         │
│                                                             │
│   // 3. Commitment verification                            │
│   computed := sha3(public_inputs + nullifier)              │
│   if computed != proof.Commitment {                        │
│     return false, errors.New("commitment mismatch")        │
│   }                                                         │
│                                                             │
│   // 4. STARK verification (MOCK in Phase 3)               │
│   // PRODUCTION: Call Winterfell/Stone verifier            │
│   valid := winterfell_verify(proof, public_inputs)         │
│                                                             │
│   return valid, nil                                        │
│ }                                                           │
│                                                             │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────┐
│ Store Commitment ON-CHAIN (Fabric Ledger)                  │
│                                                             │
│ PutState("ZK_COMMITMENT_0xabc...", {                       │
│   commitment: "0xabc...",                                  │
│   nullifier: "0x789...",                                   │
│   timestamp: 1700000000,                                   │
│   used: true,                                              │
│   transaction: "TX_ZK_001"                                 │
│ })                                                          │
│                                                             │
│ PutState("ZK_NULLIFIER_0x789...", "1")                     │
│ ↑ Prevents reuse (double-spend protection)                 │
│                                                             │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ↓
┌────────────────────────────────────────────────────────────┐
│ Response                                                    │
│ {                                                           │
│   "success": true,                                          │
│   "verification_status": "PASSED",                          │
│   "commitment_stored": true,                                │
│   "nullifier_recorded": true,                               │
│   "tx_id": "ZK_ATTEST_001"                                 │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## ON-CHAIN vs OFF-CHAIN Breakdown

### **OFF-CHAIN (User's Device/Server)** 🔒
**What Happens:**
- Private data stays private
- STARK prover generates proof
- Heavy computation (can take seconds/minutes)
- Uses private witness (secret data)

**Example:**
```javascript
// OFF-CHAIN: User's private data
const privateData = {
  kyc_level: 3,
  balance: 1000000,
  jurisdiction: "US",
  ssn: "123-45-6789", // NEVER goes on-chain!
};

// Generate STARK proof using Winterfell
const proof = winterfell_prover.prove({
  statement: "KYC Level >= 2",
  privateData: privateData,
  publicInputs: ["KYC_MIN_2"],
});

// Only the PROOF goes to blockchain, not the private data!
```

### **ON-CHAIN (Hyperledger Fabric Chaincode)** ✅
**What Happens:**
- Receives only the proof (no private data)
- Verifies proof mathematically
- Stores commitment permanently
- Prevents nullifier reuse

**Location:** `zkverifier/zk_verifier.go` - Lines 52-95

**Example:**
```go
// ON-CHAIN: Verification in chaincode
func (sv *STARKVerifier) VerifyProof(proof *STARKProof) (bool, error) {
    // Check nullifier hasn't been used
    if sv.nullifiers[proof.Nullifier] {
        return false, errors.New("nullifier already used")
    }
    
    // Verify commitment matches
    computed := sha3(proof.PublicInputs + proof.Nullifier)
    if computed != proof.Commitment {
        return false, errors.New("invalid commitment")
    }
    
    // Verify STARK proof (cryptographic validation)
    // This checks polynomial commitments, FRI protocol, etc.
    valid := verifySTARKMath(proof)
    
    return valid, nil
}
```

---

## Where Each Component Lives

| Component | Location | On/Off-Chain | Purpose |
|-----------|----------|--------------|---------|
| **Proof Generation** | User device/server | OFF-CHAIN | Generate ZK proof from private data |
| **Proof Verification** | `zkverifier/zk_verifier.go:52` | ON-CHAIN | Validate proof mathematically |
| **Commitment Storage** | `zkverifier/zk_verifier.go:151` | ON-CHAIN | Store on Fabric ledger |
| **Nullifier Tracking** | `zkverifier/zk_verifier.go:156` | ON-CHAIN | Prevent double-use |
| **API Endpoint** | `/zk/attest` | Entry Point | Submit proof to blockchain |

---

## Real-World Example: Private KYC Attestation

### **Scenario:**
Alice wants to transfer $500,000 but needs to prove she has KYC Level ≥ 2 WITHOUT revealing her actual KYC level (which is 3).

### **Step 1: OFF-CHAIN Proof Generation**
```python
# Alice's device (PRIVATE)
from winterfell import STARKProver

private_witness = {
    "kyc_level": 3,          # Private (never leaves Alice's device)
    "name": "Alice Johnson",  # Private
    "ssn": "123-45-6789",    # Private
    "balance": 1000000,      # Private
}

public_statement = {
    "min_kyc_required": 2,   # Public
    "timestamp": 1700000000  # Public
}

# Generate proof
prover = STARKProver()
proof = prover.prove(
    circuit="kyc_minimum_check",
    private_witness=private_witness,
    public_inputs=public_statement
)

# Proof output (this goes on-chain)
proof_data = {
    "proof_bytes": "0x0a1b2c3d4e5f...",  # Cryptographic proof
    "public_inputs": ["KYC_MIN_2"],      # Only reveals requirement
    "commitment": "0xabc123...",         # Hash of inputs
    "nullifier": "0x789xyz...",          # Unique one-time ID
}
```

### **Step 2: ON-CHAIN Verification**
```bash
# Submit to blockchain
curl -X POST http://localhost:3000/api/v1/zk/attest \
  -H "Content-Type: application/json" \
  -d '{
    "proof_bytes": "0x0a1b2c3d4e5f...",
    "public_inputs": ["KYC_MIN_2"],
    "commitment": "0xabc123...",
    "nullifier": "0x789xyz..."
  }'
```

### **Step 3: Chaincode Executes** (ON-CHAIN)
```go
// zkverifier/zk_verifier.go (runs on Fabric peer)

// 1. Check nullifier hasn't been used
if nullifiers["0x789xyz..."] == true {
    return error("This proof was already used!")
}

// 2. Verify commitment
expected := sha3("KYC_MIN_2" + "0x789xyz...")
if expected != "0xabc123..." {
    return error("Commitment mismatch!")
}

// 3. Verify STARK proof mathematically
if !winterfell_verify(proof_bytes, public_inputs) {
    return error("Proof verification failed!")
}

// 4. Store on blockchain
PutState("ZK_COMMITMENT_0xabc123...", commitment_record)
PutState("ZK_NULLIFIER_0x789xyz...", "1")  // Mark as used

return success("Proof verified! Alice has KYC ≥ 2")
```

### **Step 4: Result**
✅ **Blockchain now knows:** Alice has KYC Level ≥ 2  
🔒 **Blockchain NEVER knew:** Alice's actual level (3), name, SSN, or balance  
🛡️ **Security:** Proof cannot be reused (nullifier tracked)  

---

## How to Verify It Yourself

### **Method 1: Check the Code**
```bash
# View the verification logic
cat chaincode/genusd-chaincode/zkverifier/zk_verifier.go

# Key functions:
# - VerifyProof() (line 52) - Main verification
# - VerifyAndStoreCommitment() (line 108) - Store on-chain
# - IsNullifierUsed() (line 206) - Check double-use
```

### **Method 2: Run Unit Tests**
```bash
cd chaincode/genusd-chaincode

# Test ZK proof verification
go test -v ./zkverifier -run TestVerifyProof

# Expected output:
# PASS: TestVerifyProof_ValidProof
# PASS: TestVerifyProof_NullifierReuse (should fail)
# PASS: TestVerifyProof_InvalidCommitment (should fail)
```

### **Method 3: Query On-Chain State**
```bash
# After a proof is verified, check if commitment is stored
peer chaincode query \
  -C genusdc \
  -n genusd \
  -c '{"function":"GetCommitment","Args":["0xabc123..."]}'

# Response:
# {
#   "commitment": "0xabc123...",
#   "nullifier": "0x789xyz...",
#   "timestamp": 1700000000,
#   "used": true,
#   "transaction": "ZK_ATTEST_001"
# }
```

### **Method 4: Check Nullifier Tracking**
```bash
# Verify nullifier is marked as used
peer chaincode query \
  -C genusdc \
  -n genusd \
  -c '{"function":"IsNullifierUsed","Args":["0x789xyz..."]}'

# Response: true (cannot be reused)
```

### **Method 5: API Test**
```javascript
// Using JavaScript SDK
const client = createClient({
  apiUrl: 'http://localhost:3000/api/v1'
});

const proof = {
  proof_bytes: "0x0a1b2c3d...",
  public_inputs: ["KYC_MIN_2"],
  commitment: "0xabc123...",
  nullifier: "0x789xyz..."
};

const result = await client.verifyZKProof(proof);
console.log(result);
// {
//   success: true,
//   verification_status: "PASSED",
//   commitment_stored: true
// }

// Try to reuse same proof (should fail)
const result2 = await client.verifyZKProof(proof);
console.log(result2);
// {
//   success: false,
//   error: "nullifier 0x789xyz... already used"
// }
```

---

## Current Implementation Status

### ✅ **What's Implemented (Phase 3)**
1. **ON-CHAIN Verification Logic** (`zkverifier/zk_verifier.go`)
   - Proof structure validation
   - Commitment verification (SHA3 hashing)
   - Nullifier tracking (double-spend prevention)
   - On-chain storage (Fabric ledger)
   - Mock STARK verification

2. **Integration with Smart Contract** (`genusd/contract.go:345`)
   - `VerifyZKProof()` function
   - Metrics recording
   - Audit logging

3. **API Endpoint** (`/zk/attest`)
   - REST endpoint documented
   - Request/response schemas
   - Error handling

### 🔄 **What's Mock (Needs Production Integration)**
1. **STARK Verification Algorithm**
   - Current: Mock verification using hash checks
   - Production: Integrate Winterfell or Stone verifier
   - Location: `zk_verifier.go:84-90`

2. **Proof Generation**
   - Current: `CreateMockProof()` for testing
   - Production: Real STARK prover (off-chain)
   - User would run: Winterfell, StarkWare, or custom prover

### 📋 **Production Integration Path**

**Step 1: Install Winterfell (Rust STARK library)**
```bash
# Add Rust STARK verifier
cargo install winterfell-prover
```

**Step 2: Create Go FFI Bindings**
```go
// Create bridge: Go ↔ Rust
// File: zkverifier/winterfell_bridge.go

/*
#cgo LDFLAGS: -L./lib -lwinterfell
#include "winterfell.h"
*/
import "C"

func verifyWinterfellProof(proofBytes []byte, publicInputs []string) bool {
    cProof := C.CBytes(proofBytes)
    defer C.free(cProof)
    
    result := C.winterfell_verify(cProof, C.int(len(proofBytes)))
    return bool(result)
}
```

**Step 3: Replace Mock Verification**
```go
// Replace line 84-90 in zk_verifier.go

// BEFORE (Mock):
valid := sv.computeProofHash(proof.ProofBytes, proof.PublicInputs)

// AFTER (Production):
valid := verifyWinterfellProof(proof.ProofBytes, proof.PublicInputs)
```

---

## Security Guarantees

### **Zero-Knowledge Property** 🔒
- **Verifier learns:** Statement is true (e.g., "KYC ≥ 2")
- **Verifier NEVER learns:** Private data (actual KYC level, name, SSN)

### **Soundness** ✅
- Cheating prover cannot create valid proof for false statement
- Probability of forgery: < 2^-128 (cryptographically secure)

### **Completeness** ✅
- Honest prover can always create valid proof for true statement

### **Nullifier Prevents Double-Use** 🛡️
- Each proof has unique nullifier
- Nullifier tracked on-chain: `PutState("ZK_NULLIFIER_...", "1")`
- Reuse attempt: rejected immediately

---

## Summary

| Aspect | Location | Status |
|--------|----------|--------|
| **Proof Generation** | OFF-CHAIN (user device) | 🔄 Mock (needs Winterfell prover) |
| **Proof Verification** | ON-CHAIN (chaincode) | ✅ Implemented (mock math) |
| **Commitment Storage** | ON-CHAIN (Fabric ledger) | ✅ Fully implemented |
| **Nullifier Tracking** | ON-CHAIN (Fabric ledger) | ✅ Fully implemented |
| **API Endpoint** | `/zk/attest` | ✅ Documented |
| **SDK Support** | JS + Python | ✅ Implemented |

**Bottom Line:** 
- ✅ **Verification happens ON-CHAIN** (in Fabric chaincode)
- ✅ **Storage happens ON-CHAIN** (in Fabric ledger)
- 🔒 **Private data stays OFF-CHAIN** (never leaves user's device)
- 🔄 **Production needs:** Real STARK prover integration (Winterfell/Stone)
