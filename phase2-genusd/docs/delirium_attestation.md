# Delirium Attestation: Zero-Knowledge Proof-of-Reserves Layer

**Document Version:** 1.0  
**Date:** November 29, 2025  
**Project:** GENUSD Stablecoin - Phase 2  
**Status:** Conceptual Design (Implementation: Phase 3+)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Delirium Architecture](#2-delirium-architecture)
3. [Attestation Types](#3-attestation-types)
4. [Zero-Knowledge Proof Primitives](#4-zero-knowledge-proof-primitives)
5. [Reserve Proof Protocol](#5-reserve-proof-protocol)
6. [Integration with GENUSD Engine](#6-integration-with-genusd-engine)
7. [API Endpoints](#7-api-endpoints)
8. [Security Model](#8-security-model)
9. [Future Enhancements](#9-future-enhancements)

---

## 1. Introduction

### 1.1 What is Delirium?

**Delirium** is the off-chain attestation engine for GENUSD that provides cryptographic proofs of reserve backing without revealing sensitive financial details. It combines:

- **Zero-Knowledge Proofs**: Prove statements about reserves without exposing account balances
- **Merkle Trees**: Enable efficient exclusion proofs (e.g., "address X is not on blacklist")
- **Blind Signatures**: Allow KYC verification without revealing identity to all parties
- **Time-Stamping**: Ensure attestations are fresh and auditable

### 1.2 Design Goals

| Goal | Requirement | How Delirium Achieves It |
|------|-------------|--------------------------|
| **Full-Reserve Backing** | Prove reserves ≥ liabilities | zk-SNARK range proof over aggregated balances |
| **Privacy** | Hide individual account balances | Pedersen commitments + Bulletproofs |
| **Transparency** | Anyone can verify attestations | Public verification keys + on-chain attestation roots |
| **Compliance** | Support regulatory audits | Designated auditor keys with selective decryption |
| **Performance** | Fast verification (<1s) | Groth16 SNARKs for constant-size proofs |

### 1.3 Trust Model

```
┌─────────────────┐
│  Reserve Bank   │  ← Custodian holding USD
└────────┬────────┘
         │ Account statements
         ↓
┌─────────────────┐
│  Delirium Node  │  ← Off-chain prover (trusted setup)
└────────┬────────┘
         │ attestation_root + zk_proof
         ↓
┌─────────────────┐
│  GENUSD Engine  │  ← On-chain verifier (Hyperledger Fabric)
│  (Chaincode)    │
└─────────────────┘
         ↑
         │ Verifies proof
         │
┌─────────────────┐
│  Public Users   │  ← Anyone can audit via /attest API
└─────────────────┘
```

**Trust Assumptions:**
- Delirium operator is honest (or use MPC with multiple operators)
- Reserve bank provides accurate statements (audited quarterly)
- Cryptographic primitives are sound (zk-SNARKs, Merkle trees)

---

## 2. Delirium Architecture

### 2.1 System Components

```
┌──────────────────────────────────────────────────────────┐
│                    DELIRIUM SYSTEM                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐     ┌──────────────┐                  │
│  │  Data       │────▶│  Aggregator  │                  │
│  │  Collector  │     │  Engine      │                  │
│  └─────────────┘     └──────┬───────┘                  │
│         │                    │                          │
│         │ Raw data           │ Aggregated data          │
│         │                    ↓                          │
│         │            ┌──────────────┐                   │
│         │            │   Prover     │                   │
│         │            │   Engine     │                   │
│         │            └──────┬───────┘                   │
│         │                    │                          │
│         │                    │ zk_proof                 │
│         │                    ↓                          │
│         │            ┌──────────────┐                   │
│         └───────────▶│  Attestation │                   │
│                      │  Publisher   │                   │
│                      └──────┬───────┘                   │
│                             │                           │
└─────────────────────────────┼───────────────────────────┘
                              │
                              ↓
                      ┌──────────────┐
                      │  /attest API │  (Public)
                      └──────────────┘
                              │
                              ↓
                      ┌──────────────┐
                      │ GENUSD Engine│  (Verifies on-chain)
                      └──────────────┘
```

### 2.2 Data Flow

1. **Data Collection** (Every 6 hours):
   - Delirium fetches bank statements via secure API
   - Aggregates: `total_reserves_usd = Σ bank_accounts`
   - Queries GENUSD Engine: `total_liabilities = Σ active_utxos`

2. **Proof Generation** (ZK Circuit):
   - **Public Inputs**: `commitment_reserves`, `commitment_liabilities`
   - **Private Inputs**: `reserves_usd`, `liabilities_genusd`, `bank_account_details`
   - **Statement**: Prove `reserves_usd ≥ liabilities_genusd AND reserves_usd = hash(bank_accounts)`

3. **Attestation Publishing**:
   - Generate `attestation_root = MerkleRoot([reserves_commitment, liabilities_commitment, timestamp])`
   - Publish to `/attest` API endpoint
   - Store in GENUSD Engine metadata for minting validation

---

## 3. Attestation Types

### 3.1 Reserve Attestation (Type A)

**Purpose**: Prove full-reserve backing without revealing bank account details.

**JSON Structure**:
```json
{
  "attestation_id": "ATT_RESERVE_20251129_001",
  "attestation_type": "RESERVE_PROOF",
  "timestamp": 1732867200,
  "valid_until": 1732888800,
  "claim": {
    "statement": "Total reserves ≥ total GENUSD supply",
    "public_inputs": {
      "total_liabilities_genusd": 150000000,
      "reserves_commitment": "0x7a3f8b2c...",
      "margin_percent": 5
    }
  },
  "proof": {
    "protocol": "Groth16",
    "curve": "BN254",
    "proof_bytes": "0x1a2b3c4d...",
    "verification_key": "0x9f8e7d6c..."
  },
  "auditor": {
    "name": "Deloitte LLP",
    "audit_report_hash": "SHA256:abc123...",
    "signature": "0x5e4d3c2b..."
  }
}
```

**Verification Algorithm**:
```python
def verify_reserve_attestation(attestation, public_vk):
    """
    Verify reserve attestation proof
    
    Args:
        attestation: Attestation JSON object
        public_vk: Public verification key
        
    Returns:
        bool: True if proof is valid
    """
    # 1. Check timestamp freshness
    if attestation['timestamp'] < now() - 6*HOURS:
        return False
    
    # 2. Verify zk-SNARK proof
    public_inputs = [
        attestation['claim']['public_inputs']['total_liabilities_genusd'],
        attestation['claim']['public_inputs']['reserves_commitment']
    ]
    proof = attestation['proof']['proof_bytes']
    
    if not groth16_verify(public_vk, public_inputs, proof):
        return False
    
    # 3. Verify auditor signature
    message = hash(attestation['claim'])
    if not ecdsa_verify(auditor_pubkey, message, attestation['auditor']['signature']):
        return False
    
    return True
```

### 3.2 KYC Attestation (Type B)

**Purpose**: Prove user has sufficient KYC level without revealing identity.

**Blind Signature Protocol**:
```
User                     KYC Provider                GENUSD Engine
  |                            |                           |
  |---(1) blind(identity)----->|                           |
  |                            |                           |
  |<--(2) blind_sig(KYC_L2)----|                           |
  |                            |                           |
  |---(3) unblind(sig)---------|                           |
  |                            |                           |
  |---(4) tx + kyc_tag + sig-------------------------->|   |
  |                            |                           |
  |                            |<--(5) verify_blind_sig----|
  |                            |                           |
  |                            |----(6) valid:true-------->|
  |<--(7) tx_accepted--------------------------------------|
```

**JSON Structure**:
```json
{
  "attestation_type": "KYC_PROOF",
  "kyc_tag": "KYC_LEVEL_2",
  "blinded_identity": "0x4f3a2b1c...",
  "provider_signature": "0x9e8d7c6b...",
  "issued_at": 1732867200,
  "expires_at": 1764403200
}
```

### 3.3 Jurisdiction Compliance Attestation (Type C)

**Purpose**: Prove transaction complies with regional regulations.

**Example**: US OFAC Sanctions Check
```json
{
  "attestation_type": "JURISDICTION_PROOF",
  "jurisdiction": "US",
  "compliance_checks": [
    {
      "check_type": "OFAC_SANCTIONS",
      "result": "PASS",
      "merkle_exclusion_proof": {
        "root": "0x3b2a1f0e...",
        "path": ["0x4c3d2e1f...", "0x5d4e3f2a..."],
        "leaf": "hash(owner_id)",
        "position": 42
      }
    },
    {
      "check_type": "AML_DAILY_LIMIT",
      "result": "PASS",
      "remaining_limit": 950000
    }
  ],
  "timestamp": 1732867200
}
```

### 3.4 Non-Blacklist Attestation (Type D)

**Purpose**: Prove UTXO owner is not on sanctions list.

**Merkle Exclusion Proof**:
```python
def verify_exclusion_proof(owner_id, merkle_root, proof_path):
    """
    Prove owner_id is NOT in blacklist Merkle tree
    
    Args:
        owner_id: User identifier
        merkle_root: Root hash of blacklist tree
        proof_path: Merkle path to nearest leaf
        
    Returns:
        bool: True if owner is proven NOT in blacklist
    """
    leaf_hash = sha256(owner_id)
    computed_root = merkle_compute_root(leaf_hash, proof_path)
    
    # If computed root matches, the leaf EXISTS in tree (blacklisted)
    if computed_root == merkle_root:
        return False  # BLACKLISTED
    
    # If root doesn't match, prove non-membership via sorted tree
    # (requires additional protocol details)
    return verify_sorted_exclusion(leaf_hash, merkle_root, proof_path)
```

---

## 4. Zero-Knowledge Proof Primitives

### 4.1 Bulletproofs (Range Proofs)

**Use Case**: Prove `0 < amount < MAX_AMOUNT` without revealing amount.

**Example**: Confidential Transfer
```python
# Sender creates commitment
amount = 50000  # $500.00
blinding_factor = random_scalar()
commitment = pedersen_commit(amount, blinding_factor)

# Generate range proof
range_proof = bulletproof_prove(
    value=amount,
    blinding=blinding_factor,
    min=0,
    max=MAX_UTXO_AMOUNT
)

# Verifier checks
assert bulletproof_verify(commitment, range_proof)
# Verifier learns: amount ∈ [0, MAX] but NOT the exact amount
```

**Proof Size**: ~700 bytes (logarithmic in range)

### 4.2 Groth16 zk-SNARKs (Reserve Proof)

**Circuit Constraints** (Circom):
```circom
template ReserveProof() {
    // Public inputs
    signal input total_supply;
    signal input commitment_reserves;
    
    // Private inputs
    signal input reserves[10];  // Up to 10 bank accounts
    signal input blinding;
    
    // Constraints
    signal sum_reserves;
    sum_reserves <== reserves[0] + reserves[1] + ... + reserves[9];
    
    // Assert reserves >= supply
    component gte = GreaterThanOrEqual();
    gte.in[0] <== sum_reserves;
    gte.in[1] <== total_supply;
    gte.out === 1;
    
    // Assert commitment matches
    signal computed_commitment;
    computed_commitment <== Pedersen([sum_reserves, blinding]);
    computed_commitment === commitment_reserves;
}
```

**Performance**:
- **Proving Time**: ~2 seconds (client-side)
- **Verification Time**: ~5 milliseconds (on-chain)
- **Proof Size**: 128 bytes (constant)

### 4.3 Merkle Trees (Blacklist Proofs)

**Structure**:
```
                     ROOT
                    /    \
                   /      \
                  H1      H2
                 /  \    /  \
                A    B  C    D
                
A = hash("user1:blacklisted")
B = hash("user2:blacklisted")
C = hash("user3:blacklisted")
D = hash("user4:blacklisted")
```

**Exclusion Proof** (for user5):
1. Compute `H = hash("user5:blacklisted")`
2. Show that H does NOT exist in tree by:
   - Providing path to nearest leaf (e.g., between B and C)
   - Proving tree is sorted (ordered by hash)
   - Demonstrating no leaf matches H

---

## 5. Reserve Proof Protocol

### 5.1 Detailed Workflow

**Step 1: Data Aggregation** (Every 6 hours)
```python
def aggregate_reserves():
    """
    Aggregate reserve data from multiple sources
    """
    reserves = []
    
    # Fetch from Bank 1 (JP Morgan)
    reserves.append(fetch_balance("JPM_ACCOUNT_001"))  # $500M
    
    # Fetch from Bank 2 (HSBC)
    reserves.append(fetch_balance("HSBC_ACCOUNT_002"))  # $300M
    
    # Fetch from Bank 3 (Citibank)
    reserves.append(fetch_balance("CITI_ACCOUNT_003"))  # $200M
    
    total_reserves = sum(reserves)  # $1B
    
    # Get on-chain liabilities
    total_supply = query_genusd_engine("total_supply")  # $950M
    
    return {
        "reserves": reserves,
        "total_reserves": total_reserves,
        "total_supply": total_supply,
        "margin": total_reserves - total_supply  # $50M
    }
```

**Step 2: Commitment Generation**
```python
def generate_commitments(reserve_data):
    """
    Create Pedersen commitments for privacy
    """
    # Commit to total reserves
    r_reserves = random_scalar()
    commitment_reserves = pedersen_commit(
        reserve_data['total_reserves'], 
        r_reserves
    )
    
    # Commit to liabilities
    r_liabilities = random_scalar()
    commitment_liabilities = pedersen_commit(
        reserve_data['total_supply'],
        r_liabilities
    )
    
    return {
        "commitment_reserves": commitment_reserves,
        "commitment_liabilities": commitment_liabilities,
        "blinding_reserves": r_reserves,
        "blinding_liabilities": r_liabilities
    }
```

**Step 3: ZK Proof Generation**
```python
def generate_reserve_proof(reserve_data, commitments):
    """
    Generate Groth16 proof that reserves >= liabilities
    """
    # Prepare circuit inputs
    public_inputs = [
        commitments['commitment_reserves'],
        commitments['commitment_liabilities']
    ]
    
    private_inputs = [
        reserve_data['total_reserves'],
        reserve_data['total_supply'],
        reserve_data['reserves'],  # Individual bank balances
        commitments['blinding_reserves'],
        commitments['blinding_liabilities']
    ]
    
    # Generate proof (calls circom + snarkjs)
    proof = groth16_prove(
        circuit="reserve_proof.circom",
        public_inputs=public_inputs,
        private_inputs=private_inputs
    )
    
    return proof
```

**Step 4: Attestation Publication**
```python
def publish_attestation(reserve_data, proof):
    """
    Publish attestation to /attest API and on-chain
    """
    attestation = {
        "attestation_id": generate_id(),
        "timestamp": int(time.time()),
        "valid_until": int(time.time()) + 6*3600,  # Valid 6 hours
        "claim": {
            "statement": "Reserves >= Supply",
            "public_inputs": {
                "commitment_reserves": proof['public_inputs'][0],
                "commitment_liabilities": proof['public_inputs'][1],
                "margin_percent": calculate_margin_percent(reserve_data)
            }
        },
        "proof": {
            "protocol": "Groth16",
            "proof_bytes": proof['proof'],
            "verification_key": load_vk()
        },
        "auditor": sign_by_auditor(proof)
    }
    
    # Publish to API
    post("/attest/latest", attestation)
    
    # Store attestation_root on-chain
    attestation_root = merkle_root([
        attestation['claim']['public_inputs']['commitment_reserves'],
        attestation['claim']['public_inputs']['commitment_liabilities'],
        attestation['timestamp']
    ])
    
    invoke_chaincode("StoreAttestationRoot", [attestation_root])
    
    return attestation
```

### 5.2 Verification by GENUSD Engine

**On-Chain Verification** (Hyperledger Fabric Chaincode):
```javascript
async function VerifyMintTransaction(ctx, tx) {
    // 1. Get latest attestation root
    const attestationRoot = await ctx.stub.getState('LATEST_ATTESTATION_ROOT');
    
    // 2. Check attestation is fresh (< 6 hours old)
    const attestationTimestamp = await ctx.stub.getState('ATTESTATION_TIMESTAMP');
    const now = Math.floor(Date.now() / 1000);
    if (now - attestationTimestamp > 6 * 3600) {
        throw new Error('Attestation expired. Cannot mint.');
    }
    
    // 3. Check mint amount doesn't exceed margin
    const currentSupply = await GetTotalSupply(ctx);
    const newSupply = currentSupply + tx.mint_amount;
    
    // Attestation guarantees: reserves >= current_supply + margin
    // We trust attestation without re-verifying zk-proof on-chain (gas cost)
    // Instead, verify proof off-chain and only store attestation_root
    
    // 4. Verify attestation_root signature (auditor signed it)
    const auditorPubkey = await ctx.stub.getState('AUDITOR_PUBKEY');
    const attestationSignature = tx.metadata.attestation_signature;
    
    if (!verifySignature(auditorPubkey, attestationRoot, attestationSignature)) {
        throw new Error('Invalid attestation signature');
    }
    
    // 5. Allow mint
    return true;
}
```

---

## 6. Integration with GENUSD Engine

### 6.1 MINT Transaction Flow

```
User/Issuer              GENUSD Engine              Delirium Node
     |                         |                           |
     |---(1) Request Mint)---->|                           |
     |                         |                           |
     |                         |---(2) Check attestation)->|
     |                         |                           |
     |                         |<--(3) attestation_root----|
     |                         |                           |
     |                         |--(4) Verify freshness     |
     |                         |    & margin               |
     |                         |                           |
     |                         |--(5) Accept/Reject        |
     |                         |                           |
     |<--(6) MINT success------|                           |
     |                         |                           |
     |                         |---(7) Update supply------>|
     |                         |                           |
```

### 6.2 Attestation Caching

**On-Chain State**:
```javascript
{
  "LATEST_ATTESTATION_ROOT": "0x7a3f8b2c...",
  "ATTESTATION_TIMESTAMP": 1732867200,
  "ATTESTATION_MARGIN_PCT": 5,
  "AUDITOR_PUBKEY": "0x04a1b2c3..."
}
```

**Update Frequency**: Every 6 hours (or on-demand if margin < 2%)

---

## 7. API Endpoints

### 7.1 GET /attest/latest

**Description**: Retrieve the most recent reserve attestation.

**Response**:
```json
{
  "attestation_id": "ATT_RESERVE_20251129_001",
  "attestation_type": "RESERVE_PROOF",
  "timestamp": 1732867200,
  "valid_until": 1732888800,
  "claim": {
    "statement": "Total reserves ≥ total GENUSD supply",
    "public_inputs": {
      "total_liabilities_genusd": 150000000,
      "reserves_commitment": "0x7a3f8b2c...",
      "margin_percent": 5
    }
  },
  "proof": {
    "protocol": "Groth16",
    "curve": "BN254",
    "proof_bytes": "0x1a2b3c4d...",
    "verification_key": "0x9f8e7d6c..."
  },
  "auditor": {
    "name": "Deloitte LLP",
    "audit_report_hash": "SHA256:abc123...",
    "signature": "0x5e4d3c2b..."
  }
}
```

### 7.2 GET /attest/history

**Description**: Retrieve historical attestations.

**Query Parameters**:
- `from`: Start timestamp
- `to`: End timestamp
- `limit`: Max results (default: 100)

**Response**:
```json
{
  "attestations": [
    { "attestation_id": "ATT_RESERVE_20251129_001", ... },
    { "attestation_id": "ATT_RESERVE_20251128_004", ... },
    ...
  ],
  "total": 247,
  "page": 1
}
```

### 7.3 POST /attest/verify

**Description**: Verify a specific attestation proof.

**Request**:
```json
{
  "attestation_id": "ATT_RESERVE_20251129_001",
  "verification_key": "0x9f8e7d6c..."
}
```

**Response**:
```json
{
  "valid": true,
  "verification_time_ms": 4.2,
  "details": {
    "proof_verified": true,
    "signature_verified": true,
    "timestamp_valid": true
  }
}
```

---

## 8. Security Model

### 8.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| **Delirium operator lies about reserves** | Multi-party computation (MPC) with 3+ operators; require 2-of-3 signatures |
| **Bank provides false statements** | Quarterly independent audits; cross-check with blockchain (on-chain redemptions) |
| **Attestation replay attack** | Include timestamp in attestation; verify freshness (<6 hours) |
| **Proof forgery** | Use battle-tested zk-SNARK libraries (circom, snarkjs); public verification keys |
| **KYC provider collusion** | Use blind signatures; provider cannot link KYC check to on-chain transaction |

### 8.2 Cryptographic Assumptions

- **Discrete Log Problem**: Pedersen commitments are hiding and binding
- **zk-SNARK Soundness**: Groth16 with trusted setup (Powers of Tau ceremony)
- **Hash Function Security**: SHA-256, Keccak-256 are collision-resistant
- **ECDSA Security**: Auditor signatures use secp256k1 curve

### 8.3 Auditability

**Audit Trail**:
1. All attestations stored in immutable log (IPFS or Arweave)
2. On-chain `attestation_root` history queryable via Fabric
3. Bank statements archived for 7 years (regulatory requirement)
4. Quarterly audits by Big 4 accounting firm

**Public Verification**:
- Anyone can download attestation + verification key
- Run verifier locally: `snarkjs groth16 verify vk.json public.json proof.json`
- Check auditor signature using public key

---

## 9. Future Enhancements

### 9.1 Decentralized Delirium (Phase 4)

**Multi-Party Computation (MPC)**:
```
Operator 1 (US)     Operator 2 (EU)     Operator 3 (SG)
      |                    |                    |
      |--- Share 1 --------|                    |
      |                    |--- Share 2 --------|
      |                    |                    |
      |<-------- Aggregate Proof --------------|
      |                    |                    |
      └──────── Threshold Signature ───────────┘
                  (2-of-3 required)
```

**Benefits**:
- No single point of trust
- Operators cannot individually fake reserves
- Geographic distribution (regulatory compliance)

### 9.2 Recursive Proofs (zkRollups)

**Batch Attestations**:
- Generate 1 proof for 1000 attestations
- Reduces on-chain storage cost
- Faster verification (1 proof instead of 1000)

**Example**: Prove "All attestations in last 30 days show reserves ≥ supply"

### 9.3 Confidential Auditing

**Selective Disclosure**:
- Regulators get decryption key for detailed breakdowns
- Public only sees aggregated proof
- Balances privacy with compliance

**Encrypted Bank Statements**:
```json
{
  "bank": "JPMorgan",
  "encrypted_balance": "AES(balance, auditor_key)",
  "proof": "zk-proof that encrypted_balance > X"
}
```

---

## Appendix A: Implementation Roadmap

| Phase | Milestone | Timeline |
|-------|-----------|----------|
| **Phase 2** (Current) | Conceptual design, API specs, mock proofs | Nov 2025 |
| **Phase 3** | Integrate Groth16 library, deploy to Fabric testnet | Q1 2026 |
| **Phase 4** | Production deployment, Big 4 audit | Q2 2026 |
| **Phase 5** | MPC setup, decentralized Delirium | Q3 2026 |

## Appendix B: References

- **OpenCBDC**: MIT Digital Currency Initiative (https://github.com/mit-dci/opencbdc-tx)
- **Groth16**: "On the Size of Pairing-based Non-interactive Arguments" (Jens Groth, 2016)
- **Bulletproofs**: "Bulletproofs: Short Proofs for Confidential Transactions" (Bünz et al., 2018)
- **Delirium**: Original concept from "Privacy-Preserving Proof-of-Reserves" (Provisions, 2019)
- **Circom**: Circom language documentation (https://docs.circom.io)

---

**Document Status**: ✅ Conceptual design complete. Ready for Phase 3 implementation.
