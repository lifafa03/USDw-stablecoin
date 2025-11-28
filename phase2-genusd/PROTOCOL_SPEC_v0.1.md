# GENUSD Protocol Specification v0.1

**Project:** GENUSD Stablecoin - Phase 2  
**Version:** 0.1.0  
**Date:** November 28, 2025  
**Status:** Design & Mock Simulation Phase  
**Target Platform:** Hyperledger Fabric (Future)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [UTXO Schema](#2-utxo-schema)
3. [Transaction Types](#3-transaction-types)
4. [State Machine & Validation Rules](#4-state-machine--validation-rules)
5. [Compliance Framework Integration](#5-compliance-framework-integration)
6. [Privacy & Attestation Layer](#6-privacy--attestation-layer)
7. [Hyperledger Fabric Mapping](#7-hyperledger-fabric-mapping)
8. [Appendix: Examples](#8-appendix-examples)

---

## 1. Introduction

### 1.1 Overview

**GENUSD** is a full-reserve, fiat-backed stablecoin designed according to the GENIUS framework principles:

- **G**overnance: Clear issuer authority and policy versioning
- **E**conomic backing: 1:1 fiat reserve requirement
- **N**on-inflationary: Supply tied to reserves
- **I**nteroperability: Standards-compliant API and data formats
- **U**ser protection: KYC/AML, blacklist controls, freeze capabilities
- **S**ecurity & transparency: Cryptographic attestations, audit trails

### 1.2 Design Principles

1. **UTXO-Based Model**: Inspired by Bitcoin and OpenCBDC, each token unit is represented as an unspent transaction output (UTXO)
2. **Compliance-First**: Every UTXO carries KYC metadata and jurisdiction tags
3. **Full-Reserve Backing**: Total supply ≤ verified fiat reserves
4. **Deterministic Validation**: All transactions validated against policy rules
5. **Fabric-Ready**: Schema designed to map cleanly into Hyperledger Fabric world state

### 1.3 Token Specifications

| Property | Value |
|----------|-------|
| Token Name | GENUSD |
| Token Code | GENUSD |
| Smallest Unit | 1 cent (0.01 USD) |
| Unit Divisibility | 2 decimal places |
| Internal Representation | Integer (cents) |
| Example | 10000 units = $100.00 USD |

---

## 2. UTXO Schema

### 2.1 Core UTXO Structure

Each UTXO represents an unspent token output with the following schema:

```json
{
  "utxo_id": "string",
  "owner_id": "string",
  "asset_code": "string",
  "amount": "integer",
  "status": "string",
  "kyc_tag": "string",
  "created_at": "integer",
  "metadata": {
    "jurisdiction": "string",
    "blacklist_flag": "boolean",
    "freeze_reason": "string | null",
    "policy_version": "string",
    "issuer_attestation": "string"
  }
}
```

### 2.2 Field Definitions

#### `utxo_id` (string, required)
- **Format**: `{tx_id}:{output_index}`
- **Example**: `"MINT_20251128_001:0"`
- **Purpose**: Globally unique identifier for this UTXO
- **Constraints**: Must be unique across entire system

#### `owner_id` (string, required)
- **Format**: Wallet address, Fabric identity (MSP), or public key hash
- **Example**: `"x509::/C=US/ST=CA/O=Org1/CN=user1::/C=US/ST=CA/O=Org1/CN=ca.org1.example.com"`
- **Purpose**: Identifies the current owner who can spend this UTXO
- **Constraints**: Must be registered with valid KYC

#### `asset_code` (string, required)
- **Fixed Value**: `"GENUSD"`
- **Purpose**: Token type identifier
- **Future**: Support multi-asset systems (GENEUR, GENGBP, etc.)

#### `amount` (integer, required)
- **Unit**: Cents (smallest divisible unit)
- **Example**: `100000` = $1,000.00 USD
- **Constraints**: 
  - Must be > 0
  - Must be ≤ 9,999,999,999,999 (10 trillion dollars max per UTXO)

#### `status` (string, required)
- **Allowed Values**:
  - `"active"`: Normal, spendable UTXO
  - `"frozen"`: Compliance hold, cannot be spent
  - `"spent"`: Already consumed in a transaction
- **State Transitions**:
  - `active` → `spent` (via Transfer/Burn)
  - `active` → `frozen` (via admin policy action)
  - `frozen` → `active` (via admin unfreeze)
  - `spent` → (terminal state, no transitions)

#### `kyc_tag` (string, required)
- **Format**: `"KYC_LEVEL_{0-3}"`
- **Levels**:
  - `KYC_LEVEL_0`: Anonymous (not allowed for GENUSD)
  - `KYC_LEVEL_1`: Basic identity verification ($1,000/day limit)
  - `KYC_LEVEL_2`: Enhanced due diligence ($10,000/day limit)
  - `KYC_LEVEL_3`: Institutional/accredited ($unlimited)
- **Validation**: Must match owner's registered KYC level

#### `created_at` (integer, required)
- **Format**: Unix timestamp (seconds since epoch)
- **Example**: `1732752000` (Nov 28, 2025 00:00:00 UTC)
- **Purpose**: Transaction ordering and audit trail

#### `metadata` (object, required)

##### `metadata.jurisdiction` (string, required)
- **Format**: ISO 3166-1 alpha-2 country code
- **Example**: `"US"`, `"GB"`, `"SG"`
- **Purpose**: Regulatory jurisdiction for compliance rules
- **Validation**: Must be in allowed jurisdiction list

##### `metadata.blacklist_flag` (boolean, required)
- **Default**: `false`
- **Purpose**: Mark if owner is on sanctions list
- **Effect**: If `true`, UTXO automatically frozen

##### `metadata.freeze_reason` (string | null, optional)
- **Example**: `"AML investigation case #12345"`
- **Purpose**: Human-readable explanation for frozen UTXOs
- **Constraints**: Required if `status == "frozen"`

##### `metadata.policy_version` (string, required)
- **Format**: `"POLICY_V{major}.{minor}"`
- **Example**: `"POLICY_V1.0"`
- **Purpose**: Links UTXO to specific compliance ruleset
- **Evolution**: New policy versions may add stricter rules

##### `metadata.issuer_attestation` (string, required)
- **Format**: Base64-encoded signature or hash
- **Example**: `"SHA256:a3f5...b2c9"`
- **Purpose**: Cryptographic proof from issuer that reserve backs this UTXO
- **Verification**: Must validate against issuer's public key

### 2.3 UTXO Lifecycle

```
[Created] → [Active] → [Spent]
              ↓   ↑
          [Frozen]
```

1. **Created**: New UTXO minted or received in transfer
2. **Active**: Normal operational state, can be spent
3. **Frozen**: Compliance hold (AML review, sanctions, etc.)
4. **Spent**: Consumed as input to another transaction (terminal)

---

## 3. Transaction Types

### 3.1 Common Transaction Structure

All transactions share this base structure:

```json
{
  "type": "MINT | TRANSFER | BURN",
  "tx_id": "string",
  "timestamp": "integer",
  "inputs": ["array of utxo_id strings"],
  "outputs": ["array of UTXO objects (without utxo_id)"],
  "policy_ref": "string",
  "signatures": {
    "party_id": "signature_string"
  },
  "metadata": {
    "memo": "string",
    "reserve_proof": "string"
  }
}
```

#### Common Fields

- **`type`**: Transaction category
- **`tx_id`**: Unique transaction identifier (format: `{TYPE}_{YYYYMMDD}_{sequence}`)
- **`timestamp`**: Unix timestamp when transaction created
- **`inputs`**: Array of UTXO IDs being consumed (empty for MINT)
- **`outputs`**: Array of new UTXOs being created (empty for BURN)
- **`policy_ref`**: Policy version governing this transaction
- **`signatures`**: Map of signer ID → cryptographic signature
- **`metadata`**: Additional context (memos, reserve proofs, etc.)

---

### 3.2 MINT Transaction

**Purpose**: Create new GENUSD tokens backed by fiat reserves.

**Authorization**: Only authorized issuer can mint.

**Reserve Requirement**: Must prove 1:1 fiat backing before mint.

#### Structure

```json
{
  "type": "MINT",
  "tx_id": "MINT_20251128_001",
  "timestamp": 1732752000,
  "inputs": [],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "asset_code": "GENUSD",
      "amount": 100000000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_3",
      "created_at": 1732752000,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123..."
      }
    }
  ],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "issuer": "SIG_ISSUER_abc123..."
  },
  "metadata": {
    "memo": "Initial reserve deposit $1,000,000 USD",
    "reserve_proof": "BANK_STATEMENT_SHA256:def456..."
  }
}
```

#### Validation Rules

1. **Issuer Authorization**:
   - `signatures["issuer"]` must be present and valid
   - Issuer must have `ROLE_ISSUER` in policy

2. **No Inputs**:
   - `inputs` array must be empty
   - Mint creates tokens from nothing (backed by reserves)

3. **Reserve Proof**:
   - `metadata.reserve_proof` must reference verified reserve documentation
   - Total supply after mint ≤ verified reserves

4. **Output Validation**:
   - All outputs must have valid schema
   - `owner_id` must have valid KYC
   - `amount` > 0 for each output
   - `asset_code` == "GENUSD"

5. **Policy Compliance**:
   - Transaction must comply with `policy_ref` rules
   - Jurisdiction must be in allowed list

#### Example Use Cases

- **Initial Supply**: Central bank deposits $10M fiat, mints 1B GENUSD cents
- **Reserve Increase**: Additional fiat deposited, mint more tokens
- **Multi-recipient Mint**: Directly mint to multiple treasury accounts

---

### 3.3 TRANSFER Transaction

**Purpose**: Move GENUSD tokens from one owner to another.

**Authorization**: Owner of input UTXOs must sign.

**Conservation Law**: Sum of inputs == Sum of outputs.

#### Structure

```json
{
  "type": "TRANSFER",
  "tx_id": "TRANSFER_20251128_042",
  "timestamp": 1732755600,
  "inputs": [
    "MINT_20251128_001:0"
  ],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
      "asset_code": "GENUSD",
      "amount": 50000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_2",
      "created_at": 1732755600,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123..."
      }
    },
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "asset_code": "GENUSD",
      "amount": 99950000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_3",
      "created_at": 1732755600,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123..."
      }
    }
  ],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "x509::/C=US/ST=CA/O=Org1/CN=treasury": "SIG_SENDER_xyz789..."
  },
  "metadata": {
    "memo": "Payment for invoice #INV-2025-1234"
  }
}
```

#### Validation Rules

1. **Sender Authorization**:
   - All input UTXOs must have same `owner_id`
   - `signatures[owner_id]` must be present and valid

2. **Input Validation**:
   - All input UTXOs must exist and be `status == "active"`
   - Input UTXOs must not be `blacklist_flag == true`
   - Input UTXOs must not be frozen

3. **Conservation of Value**:
   - `sum(input amounts) == sum(output amounts)`
   - No token creation or destruction

4. **Output Validation**:
   - All recipient `owner_id` must have valid KYC
   - Recipient KYC level must meet minimum transfer threshold
   - Recipient not on blacklist
   - Recipient jurisdiction must be allowed

5. **Change UTXO**:
   - If sender doesn't spend full input amount, must create change output back to sender

6. **Daily Limits**:
   - Sender KYC level determines max daily transfer volume
   - Transaction amount must not exceed sender's remaining daily quota

#### Example Use Cases

- **Payment**: User pays merchant $500 (50,000 cents)
- **Split Payment**: One UTXO split into multiple outputs
- **Consolidation**: Multiple small UTXOs combined into one (reverse of split)

---

### 3.4 BURN Transaction

**Purpose**: Permanently destroy GENUSD tokens (e.g., for redemption to fiat).

**Authorization**: Issuer or owner can initiate burn.

**Reserve Update**: Fiat reserves decreased by burned amount.

#### Structure

```json
{
  "type": "BURN",
  "tx_id": "BURN_20251128_099",
  "timestamp": 1732759200,
  "inputs": [
    "TRANSFER_20251128_042:1"
  ],
  "outputs": [],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "issuer": "SIG_ISSUER_burn123...",
    "x509::/C=US/ST=CA/O=Org1/CN=treasury": "SIG_OWNER_burn456..."
  },
  "metadata": {
    "memo": "Redemption for bank wire $999,500 USD",
    "redemption_proof": "WIRE_CONFIRMATION_SHA256:ghi789..."
  }
}
```

#### Validation Rules

1. **Authorization**:
   - **Option A (Owner Redemption)**: `signatures[owner_id]` must be present
   - **Option B (Admin Burn)**: `signatures["issuer"]` must be present
   - At least one of the above must be valid

2. **Input Validation**:
   - All input UTXOs must exist and be `status == "active"`
   - Input UTXOs must belong to requesting party (unless issuer)

3. **No Outputs**:
   - `outputs` array must be empty
   - Tokens are destroyed, not transferred

4. **Reserve Reconciliation**:
   - `metadata.redemption_proof` should reference fiat payout
   - Reserve auditor must verify reserves decreased by burned amount

5. **Policy Compliance**:
   - Must meet minimum burn amount (e.g., $1,000 minimum redemption)
   - Redemption fees may apply per policy

#### Example Use Cases

- **User Redemption**: User cashes out $999,500 GENUSD for bank wire
- **Reserve Rebalancing**: Issuer burns excess supply
- **Seized Funds**: Regulator orders burn of sanctioned UTXOs

---

## 4. State Machine & Validation Rules

### 4.1 Transaction Processing Pipeline

```
[Submit TX] → [Schema Valid?] → [Policy Check] → [UTXO Validation] 
                ↓ No                ↓ No             ↓ No
              [Reject]            [Reject]         [Reject]
                                     ↓ Yes
                                 [Execute]
                                     ↓
                              [Update State]
                                     ↓
                              [Emit Events]
```

### 4.2 Pre-Execution Validation

#### Step 1: Schema Validation
- All required fields present
- Field types correct (string, integer, boolean)
- No extra/unknown fields
- Timestamp within acceptable clock skew (±5 minutes)

#### Step 2: Policy Authorization
- `policy_ref` exists and is active
- Signer has required role for transaction type:
  - MINT: Requires `ROLE_ISSUER`
  - TRANSFER: Requires `ROLE_USER`
  - BURN: Requires `ROLE_ISSUER` or `ROLE_USER` (owner)
- Signatures cryptographically valid

#### Step 3: UTXO Existence & Ownership
- All input UTXOs exist in state
- Input UTXOs have `status == "active"`
- For TRANSFER: All inputs owned by signer
- For BURN: Inputs owned by signer or signer is issuer

#### Step 4: Compliance Checks
- No input UTXOs have `blacklist_flag == true`
- No input UTXOs have `status == "frozen"`
- Sender KYC level sufficient for transaction amount
- Recipient(s) KYC level sufficient (for TRANSFER)
- Jurisdiction rules satisfied

#### Step 5: Business Logic Validation
- **MINT**: Reserve proof valid, supply limit not exceeded
- **TRANSFER**: Conservation law (input sum == output sum)
- **BURN**: Minimum burn amount met

### 4.3 Execution

If all validations pass:

1. **Mark Inputs as Spent**:
   - Set `status = "spent"` for all input UTXOs
   - Record `spent_in_tx = tx_id` in UTXO metadata

2. **Create Outputs**:
   - Assign `utxo_id = "{tx_id}:{index}"`
   - Initialize all output UTXOs with `status = "active"`
   - Write to state store

3. **Update Ledger State**:
   - Total supply (for MINT/BURN)
   - User balances (aggregate view)
   - Daily transfer quotas

4. **Emit Events**:
   - `UTXOCreated`: For each output
   - `UTXOSpent`: For each input
   - `TransactionCommitted`: Top-level event

### 4.4 Post-Execution

- Transaction recorded in immutable log
- State merkle root updated (for Fabric, world state hash)
- Attestation generated (issuer signs new state root)

---

## 5. Compliance Framework Integration

### 5.1 GENIUS Framework Mapping

| GENIUS Pillar | GENUSD Implementation |
|---------------|----------------------|
| **Governance** | Policy versioning (`policy_ref`), issuer role authority |
| **Economic Backing** | Reserve proofs in MINT, attestation hashes |
| **Non-Inflationary** | Total supply ≤ reserves, no arbitrary minting |
| **Interoperability** | Standard JSON schema, RESTful APIs |
| **User Protection** | KYC tags, freeze capability, blacklist checks |
| **Security & Transparency** | Cryptographic signatures, audit trail, public attestations |

### 5.2 KYC/AML Integration

#### KYC Levels

| Level | Requirements | Daily Transfer Limit | Use Case |
|-------|--------------|---------------------|----------|
| **Level 0** | None | $0 (not allowed) | Rejected |
| **Level 1** | Email + Phone | $1,000 | Consumers |
| **Level 2** | ID + Address | $10,000 | Small Business |
| **Level 3** | Full Due Diligence | Unlimited | Institutions |

#### AML Transaction Monitoring

- **Velocity Checks**: Max transactions per hour per user
- **Aggregation**: Daily/monthly volume tracking
- **Suspicious Activity**: Patterns flagged for review
- **Sanctions Screening**: Real-time blacklist checks

### 5.3 Freeze & Blacklist Controls

#### Freeze Mechanism

```json
{
  "operation": "FREEZE_UTXO",
  "utxo_id": "TRANSFER_20251128_042:0",
  "reason": "AML investigation case #12345",
  "authorized_by": "compliance_officer_id",
  "signature": "SIG_COMPLIANCE_..."
}
```

- Sets `status = "frozen"`
- Sets `metadata.freeze_reason`
- Prevents spending until unfrozen
- Issuer or compliance officer can freeze
- Requires admin signature to unfreeze

#### Blacklist Mechanism

```json
{
  "operation": "BLACKLIST_OWNER",
  "owner_id": "x509::/C=XX/O=BadActor/CN=user",
  "reason": "OFAC sanctions list",
  "effective_date": 1732752000,
  "signature": "SIG_REGULATOR_..."
}
```

- Sets `blacklist_flag = true` on all owner's UTXOs
- Automatically freezes all UTXOs
- Cannot receive new transfers
- Cannot create new transactions

---

## 6. Privacy & Attestation Layer

### 6.1 Delirium-Style Attestations

**Goal**: Prove compliance properties without revealing full UTXO details.

#### Attestation Types

1. **Reserve Attestation**:
   - **Claim**: "Total GENUSD supply ≤ verified fiat reserves"
   - **Proof**: Zero-knowledge range proof over aggregated supply
   - **Verifier**: Public (anyone can verify)

2. **KYC Attestation**:
   - **Claim**: "Owner has KYC level ≥ X"
   - **Proof**: Blind signature from KYC provider
   - **Verifier**: Transaction validators only

3. **Jurisdiction Attestation**:
   - **Claim**: "Transaction complies with US regulations"
   - **Proof**: Policy engine evaluation proof
   - **Verifier**: Auditors and regulators

4. **Non-Blacklist Attestation**:
   - **Claim**: "None of the UTXOs belong to sanctioned entities"
   - **Proof**: Merkle proof of exclusion from blacklist tree
   - **Verifier**: Transaction validators

### 6.2 Zero-Knowledge Proof Concepts (Future)

#### Confidential Transfers (Phase 3+)

- **Pedersen Commitments**: Hide amounts while proving sum conservation
- **Range Proofs**: Prove `0 < amount < MAX` without revealing amount
- **Sender Anonymity**: Use ring signatures or stealth addresses

#### Privacy-Preserving Compliance

- **Selective Disclosure**: Reveal compliance attributes to validators only
- **Encrypted Memos**: Only sender/receiver can read memo field
- **Auditor Keys**: Designated auditor can decrypt for investigations

### 6.3 Attestation Format

```json
{
  "attestation_id": "ATT_20251128_001",
  "attestation_type": "RESERVE_PROOF",
  "claim": {
    "statement": "Total supply ≤ reserves",
    "supply_commitment": "PEDERSEN:abc123...",
    "reserve_commitment": "PEDERSEN:def456..."
  },
  "proof": {
    "proof_system": "BULLETPROOFS",
    "proof_data": "BASE64:encoded_proof_bytes"
  },
  "issuer": "x509::/C=US/O=FederalReserve/CN=auditor",
  "timestamp": 1732752000,
  "signature": "SIG_AUDITOR_xyz789..."
}
```

---

## 7. Hyperledger Fabric Mapping

### 7.1 World State Representation

#### Key Design

```
UTXO:{utxo_id} → JSON(UTXO object)
OWNER_INDEX:{owner_id}:{utxo_id} → "1"
TX:{tx_id} → JSON(Transaction object)
POLICY:{policy_version} → JSON(Policy rules)
TOTAL_SUPPLY → integer
```

#### Composite Keys

```javascript
// Fabric chaincode example
const utxoKey = ctx.stub.createCompositeKey('UTXO', [utxoId]);
const ownerIndexKey = ctx.stub.createCompositeKey('OWNER_INDEX', [ownerId, utxoId]);
```

### 7.2 Chaincode Functions

| Function | Description | Arguments | Returns |
|----------|-------------|-----------|---------|
| `Mint` | Create new UTXOs | `outputs[]`, `reserve_proof` | `tx_id` |
| `Transfer` | Spend UTXOs, create new outputs | `inputs[]`, `outputs[]` | `tx_id` |
| `Burn` | Destroy UTXOs | `inputs[]`, `redemption_proof` | `tx_id` |
| `QueryUTXO` | Get UTXO by ID | `utxo_id` | `UTXO object` |
| `GetBalance` | Sum all UTXOs for owner | `owner_id` | `integer` |
| `FreezeUTXO` | Admin: Freeze UTXO | `utxo_id`, `reason` | `success` |
| `UnfreezeUTXO` | Admin: Unfreeze UTXO | `utxo_id` | `success` |
| `BlacklistOwner` | Admin: Blacklist entity | `owner_id`, `reason` | `success` |
| `UpdatePolicy` | Admin: New policy version | `policy_json` | `policy_version` |

### 7.3 Identity & MSP Integration

```javascript
// Extract identity from Fabric context
const clientIdentity = ctx.clientIdentity;
const ownerId = clientIdentity.getID(); // x509 DN
const mspId = clientIdentity.getMSPID(); // Org1MSP
const kyc = clientIdentity.getAttributeValue('kyc_level'); // KYC_LEVEL_2
```

### 7.4 Private Data Collections (Future)

For sensitive compliance data:

```json
{
  "name": "KYCPrivateData",
  "policy": "OR('Org1MSP.member', 'RegulatorMSP.member')",
  "requiredPeerCount": 1,
  "maxPeerCount": 2,
  "blockToLive": 1000000
}
```

---

## 8. Appendix: Examples

### 8.1 Complete MINT Example

```json
{
  "type": "MINT",
  "tx_id": "MINT_20251128_001",
  "timestamp": 1732752000,
  "inputs": [],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "asset_code": "GENUSD",
      "amount": 100000000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_3",
      "created_at": 1732752000,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123def456..."
      }
    }
  ],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "issuer": "SIG_ISSUER_a1b2c3d4e5f6..."
  },
  "metadata": {
    "memo": "Initial reserve deposit $1,000,000 USD",
    "reserve_proof": "BANK_STATEMENT_SHA256:xyz789..."
  }
}
```

### 8.2 Complete TRANSFER Example

```json
{
  "type": "TRANSFER",
  "tx_id": "TRANSFER_20251128_042",
  "timestamp": 1732755600,
  "inputs": ["MINT_20251128_001:0"],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
      "asset_code": "GENUSD",
      "amount": 50000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_2",
      "created_at": 1732755600,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123def456..."
      }
    },
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "asset_code": "GENUSD",
      "amount": 99950000,
      "status": "active",
      "kyc_tag": "KYC_LEVEL_3",
      "created_at": 1732755600,
      "metadata": {
        "jurisdiction": "US",
        "blacklist_flag": false,
        "freeze_reason": null,
        "policy_version": "POLICY_V1.0",
        "issuer_attestation": "SHA256:abc123def456..."
      }
    }
  ],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "x509::/C=US/ST=CA/O=Org1/CN=treasury": "SIG_SENDER_x7y8z9..."
  },
  "metadata": {
    "memo": "Payment for invoice #INV-2025-1234"
  }
}
```

### 8.3 Complete BURN Example

```json
{
  "type": "BURN",
  "tx_id": "BURN_20251128_099",
  "timestamp": 1732759200,
  "inputs": ["TRANSFER_20251128_042:1"],
  "outputs": [],
  "policy_ref": "POLICY_V1.0",
  "signatures": {
    "issuer": "SIG_ISSUER_burn123...",
    "x509::/C=US/ST=CA/O=Org1/CN=treasury": "SIG_OWNER_burn456..."
  },
  "metadata": {
    "memo": "Redemption for bank wire $999,500 USD",
    "redemption_proof": "WIRE_CONFIRMATION_SHA256:ghi789..."
  }
}
```

### 8.4 Invalid Transaction Examples

#### Invalid: Input/Output Sum Mismatch

```json
{
  "type": "TRANSFER",
  "tx_id": "TRANSFER_INVALID_001",
  "inputs": ["MINT_20251128_001:0"],
  "outputs": [
    {
      "owner_id": "...",
      "amount": 50000
    },
    {
      "owner_id": "...",
      "amount": 60000
    }
  ]
}
```
**Error**: `sum(outputs) = 110000 != 100000000 = sum(inputs)`

#### Invalid: Frozen UTXO

```json
{
  "type": "TRANSFER",
  "tx_id": "TRANSFER_INVALID_002",
  "inputs": ["FROZEN_UTXO_123:0"],
  "outputs": [...]
}
```
**Error**: `Input UTXO status is 'frozen', cannot spend`

#### Invalid: Insufficient KYC Level

```json
{
  "type": "TRANSFER",
  "outputs": [
    {
      "owner_id": "x509::/CN=user_kyc_level_1",
      "amount": 5000000
    }
  ]
}
```
**Error**: `Recipient KYC_LEVEL_1 insufficient for $50,000 transfer`

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-11-28 | Initial protocol specification |

---

**End of Protocol Specification v0.1**
