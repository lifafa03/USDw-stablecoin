# GENUSD Stablecoin API Reference

**Version:** 1.0.0  
**Base URL:** `https://api.genusd.io/v1`  
**Protocol:** REST + gRPC  
**Authentication:** Dilithium Signatures + Fabric Client Certificates

---

## Table of Contents
1. [Authentication](#authentication)
2. [Stablecoin Endpoints](#stablecoin-endpoints)
3. [Governance Endpoints](#governance-endpoints)
4. [Compliance Endpoints](#compliance-endpoints)
5. [Query Endpoints](#query-endpoints)
6. [Error Codes](#error-codes)
7. [Rate Limits](#rate-limits)

---

## Authentication

All privileged endpoints require **Dilithium signature** in request headers:

```http
POST /mint
X-Dilithium-Signature: <hex-encoded-signature>
X-Dilithium-Signer: issuer
X-Timestamp: 1732752000
Content-Type: application/json
```

**Signature Generation:**
```python
message = f"{endpoint}:{request_body}:{timestamp}"
signature = dilithium_sign(message, private_key)
headers = {
    "X-Dilithium-Signature": signature.hex(),
    "X-Dilithium-Signer": "issuer",
    "X-Timestamp": str(timestamp)
}
```

---

## Stablecoin Endpoints

### POST /mint
Mint new GENUSD tokens.

**Authorization:** Requires `issuer` Dilithium signature

**Request:**
```json
{
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "amount": 100000000,
      "kyc_tag": "KYC_LEVEL_3",
      "metadata": {
        "jurisdiction": "US",
        "policy_version": "POLICY_V1.0"
      }
    }
  ],
  "issuer_id": "issuer",
  "reserve_attestation_id": "ATTESTATION_1732752000"
}
```

**Response:**
```json
{
  "success": true,
  "tx_id": "mint_tx_abc123",
  "utxos_created": ["mint_tx_abc123:0"],
  "total_minted": 100000000,
  "timestamp": 1732752000
}
```

**Errors:**
- `401`: Invalid Dilithium signature
- `403`: Issuer not authorized
- `422`: Invalid output structure
- `500`: Chaincode invocation failed

---

### POST /transfer
Transfer GENUSD between accounts.

**Authorization:** Requires sender's Dilithium signature

**Request:**
```json
{
  "inputs": ["MINT_TX_001:0", "MINT_TX_002:1"],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=NY/O=Org2/CN=alice",
      "amount": 60000000,
      "kyc_tag": "KYC_LEVEL_2"
    },
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "amount": 40000000,
      "kyc_tag": "KYC_LEVEL_3"
    }
  ],
  "sender_id": "treasury"
}
```

**Response:**
```json
{
  "success": true,
  "tx_id": "transfer_tx_def456",
  "inputs_consumed": 2,
  "outputs_created": 2,
  "conservation_check": "PASSED",
  "timestamp": 1732752100
}
```

**Validation:**
- ✅ All input UTXOs must exist and be "active"
- ✅ Sender must own all input UTXOs
- ✅ Conservation law: Σinputs == Σoutputs
- ✅ No inputs are frozen or seized

---

### POST /burn
Destroy GENUSD tokens (e.g., for redemption).

**Authorization:** Requires user's Dilithium signature

**Request:**
```json
{
  "inputs": ["TRANSFER_TX_123:0"],
  "user_id": "alice",
  "redemption_bank_account": "USD_ACCT_9876",
  "memo": "Redeem $1,000 to checking account"
}
```

**Response:**
```json
{
  "success": true,
  "tx_id": "burn_tx_ghi789",
  "amount_burned": 100000,
  "redemption_id": "REDEMPTION_alice_1732752200",
  "status": "pending",
  "timestamp": 1732752200
}
```

**Business Rules:**
- Minimum burn: $1,000 (100,000 cents)
- Redemption processed within 24 hours
- Bank account must be KYC-verified

---

### GET /utxo/{utxo_id}
Get details of a specific UTXO.

**Authorization:** Public (read-only)

**Response:**
```json
{
  "utxo_id": "MINT_TX_001:0",
  "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
  "asset_code": "GENUSD",
  "amount": 100000000,
  "status": "active",
  "kyc_tag": "KYC_LEVEL_3",
  "created_at": 1732752000,
  "metadata": {
    "jurisdiction": "US",
    "blacklist_flag": false,
    "policy_version": "POLICY_V1.0"
  }
}
```

---

### GET /balance/{user_id}
Get total balance for a user (sum of active UTXOs).

**Authorization:** Requires user's signature OR auditor role

**Response:**
```json
{
  "user_id": "alice",
  "total_balance": 500000,
  "num_utxos": 3,
  "frozen_balance": 0,
  "available_balance": 500000,
  "kyc_level": "KYC_LEVEL_2",
  "daily_limit_remaining": 900000
}
```

---

## Governance Endpoints

### POST /policy/freeze
Freeze a user account.

**Authorization:** Requires `compliance` role + Dilithium signature

**Request:**
```json
{
  "account_id": "alice",
  "reason": "AML investigation case #12345",
  "actor": "compliance_officer_1",
  "duration_days": 30
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "GOV_ACTION_FREEZE_ACCOUNT_1732752300",
  "account_id": "alice",
  "frozen_at": 1732752300,
  "unfreeze_eligible_at": 1735430700,
  "audit_log_id": "AUDIT_1732752300"
}
```

---

### POST /policy/unfreeze
Unfreeze a user account.

**Authorization:** Requires `compliance` role + Dilithium signature

**Request:**
```json
{
  "account_id": "alice",
  "actor": "compliance_officer_1",
  "resolution": "Investigation closed, no violations found"
}
```

---

### POST /policy/seize
Seize a UTXO for compliance reasons.

**Authorization:** Requires `admin` role + Dilithium signature

**Request:**
```json
{
  "utxo_id": "TRANSFER_TX_456:0",
  "reason": "Court order #2025-CV-1234",
  "actor": "admin",
  "destination_account": "seized_assets_vault"
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "GOV_ACTION_SEIZE_UTXO_1732752400",
  "utxo_id": "TRANSFER_TX_456:0",
  "amount_seized": 50000000,
  "status": "seized",
  "audit_log_id": "AUDIT_1732752400"
}
```

---

### POST /policy/redeem
Process stablecoin redemption.

**Authorization:** Requires `issuer` role + Dilithium signature

**Request:**
```json
{
  "user_id": "alice",
  "amount": 100000,
  "bank_account": "USD_ACCT_9876",
  "actor": "issuer",
  "reference_id": "WIRE_REF_789"
}
```

**Response:**
```json
{
  "success": true,
  "redemption_id": "REDEMPTION_alice_1732752500",
  "amount": 100000,
  "status": "pending",
  "estimated_completion": "2025-11-30T12:00:00Z",
  "wire_details": {
    "bank": "Bank of America",
    "account": "***9876",
    "routing": "026009593"
  }
}
```

---

### POST /reserve/attest
Record reserve attestation from auditor.

**Authorization:** Requires `auditor` role + Dilithium signature

**Request:**
```json
{
  "hash_commitment": "0xabcd1234...",
  "reserve_amount": 100000000000,
  "auditor": "big4_auditor",
  "zk_proof": {
    "proof_bytes": "0x...",
    "public_inputs": ["reserve_total", "liability_total"],
    "nullifier": "0xnull123...",
    "commitment": "0xabcd1234..."
  },
  "attestation_metadata": {
    "audit_firm": "Deloitte",
    "audit_date": "2025-11-29",
    "report_id": "AUDIT-2025-Q4-001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "attestation_id": "ATTESTATION_1732752600",
  "hash_commitment": "0xabcd1234...",
  "reserve_amount": 100000000000,
  "zk_verification_status": "PASSED",
  "nullifier_used": false,
  "timestamp": 1732752600,
  "next_attestation_due": 1732774200
}
```

**Business Rules:**
- Auditor must attest reserves every 6 hours
- STARK proof verifies reserve >= liabilities
- Nullifier prevents proof reuse

---

## Compliance Endpoints

### POST /kyc/register
Register a user with KYC level.

**Authorization:** Requires `compliance` role

**Request:**
```json
{
  "user_id": "alice",
  "kyc_level": "KYC_LEVEL_2",
  "jurisdiction": "US",
  "verification_documents": ["passport_scan", "utility_bill"],
  "verified_by": "compliance_officer_1"
}
```

**Response:**
```json
{
  "success": true,
  "user_id": "alice",
  "kyc_level": "KYC_LEVEL_2",
  "daily_limit": 1000000,
  "verified_at": 1732752700,
  "expires_at": 1764288700
}
```

---

### POST /kyc/token
Issue KYC compliance token (optional privacy layer).

**Authorization:** Requires KYC-verified user

**Request:**
```json
{
  "user_id": "alice",
  "requested_amount": 50000,
  "purpose": "Transfer to merchant"
}
```

**Response:**
```json
{
  "success": true,
  "compliance_token": "KYC_TOKEN_abc123",
  "user_id": "alice",
  "max_amount": 50000,
  "expires_at": 1732756300,
  "one_time_use": true
}
```

---

### POST /zk/attest
Verify and store ZK proof (STARK).

**Authorization:** Public (proof validates itself)

**Request:**
```json
{
  "proof_bytes": "0x0123456789abcdef...",
  "public_inputs": ["input1", "input2", "input3"],
  "commitment": "0xcommitment_hash",
  "nullifier": "0xnullifier_hash",
  "proof_metadata": {
    "proof_system": "STARK",
    "security_level": 128,
    "version": "v1.0"
  },
  "timestamp": 1732752800
}
```

**Response:**
```json
{
  "success": true,
  "verification_status": "PASSED",
  "commitment_stored": true,
  "nullifier_recorded": true,
  "tx_id": "ZK_ATTEST_jkl012",
  "timestamp": 1732752800
}
```

**Validation:**
- ✅ Proof bytes not empty
- ✅ Commitment matches `hash(public_inputs, nullifier)`
- ✅ Nullifier not previously used
- ✅ STARK verification passes (mock in Phase 3)

---

## Query Endpoints

### GET /policy/registry
Get current governance policy.

**Response:**
```json
{
  "version": "v1.0.0",
  "created_at": 1732752000,
  "updated_at": 1732752000,
  "admin_roles": ["issuer", "auditor", "compliance", "admin"],
  "policy_rules": {
    "FREEZE_ACCOUNT": {
      "required_role": "compliance",
      "requires_dilithium": true,
      "enabled": true
    }
  },
  "emergency_mode": false
}
```

---

### GET /metrics
Prometheus metrics endpoint.

**Response:**
```
# HELP genusd_mint_total Total number of mint operations
# TYPE genusd_mint_total counter
genusd_mint_total 42

# HELP genusd_burn_total Total number of burn operations
# TYPE genusd_burn_total counter
genusd_burn_total 15

# HELP genusd_transfer_total Total number of transfer operations
# TYPE genusd_transfer_total counter
genusd_transfer_total 1337

# HELP genusd_total_supply Current total supply of GENUSD
# TYPE genusd_total_supply gauge
genusd_total_supply 500000000

# HELP genusd_zk_verification_success_total Successful ZK verifications
# TYPE genusd_zk_verification_success_total counter
genusd_zk_verification_success_total 23

# HELP genusd_governance_actions_total Governance actions executed
# TYPE genusd_governance_actions_total counter
genusd_governance_actions_total 8
```

---

### GET /audit/events
Query audit log events.

**Authorization:** Requires `auditor` role

**Query Parameters:**
- `from`: Unix timestamp (default: last 24 hours)
- `to`: Unix timestamp (default: now)
- `event_type`: Filter by type (TRANSACTION, GOVERNANCE, KYC, ZK_VERIFICATION)
- `actor`: Filter by actor ID
- `limit`: Max results (default: 100, max: 1000)

**Response:**
```json
{
  "total_events": 1337,
  "events": [
    {
      "event_id": "GOV_ACTION_FREEZE_ACCOUNT_1732752300",
      "event_type": "GOVERNANCE",
      "action": "FREEZE_ACCOUNT",
      "actor": "compliance_officer_1",
      "target": "alice",
      "timestamp": 1732752300,
      "tx_id": "tx_abc123",
      "dilithium_signature": "0x...",
      "result": "success"
    }
  ],
  "pagination": {
    "next_cursor": "cursor_xyz789"
  }
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Bad Request | Invalid JSON or missing required fields |
| 401 | Unauthorized | Missing or invalid Dilithium signature |
| 403 | Forbidden | Insufficient role/permissions |
| 404 | Not Found | UTXO, account, or resource not found |
| 409 | Conflict | UTXO already spent, nullifier reused |
| 422 | Unprocessable Entity | Business rule violation (e.g., conservation law) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Chaincode or network error |
| 503 | Service Unavailable | Fabric network unavailable |

**Error Response Format:**
```json
{
  "error": {
    "code": "UTXO_NOT_FOUND",
    "message": "UTXO MINT_TX_001:0 not found",
    "details": {
      "utxo_id": "MINT_TX_001:0",
      "timestamp": 1732752900
    }
  }
}
```

---

## Rate Limits

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|--------|
| Stablecoin Operations | 100 req/min | Per user |
| Governance Actions | 10 req/hour | Per admin |
| ZK Attestation | 10 req/hour | Global |
| Query Endpoints | 1000 req/min | Per IP |

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1732752960
```

---

## OpenAPI Spec

Full OpenAPI 3.0 specification available at:
`https://api.genusd.io/v1/openapi.yaml`

---

## SDKs

- **JavaScript/TypeScript:** `npm install @genusd/sdk`
- **Python:** `pip install genusd-sdk`
- **Go:** `go get github.com/genusd/sdk-go`

---

**Last Updated:** November 29, 2025  
**API Version:** 1.0.0  
**Support:** api-support@genusd.io
