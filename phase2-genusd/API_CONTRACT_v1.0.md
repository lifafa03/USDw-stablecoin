# GENUSD API Contract Specification v1.0

**Project:** GENUSD Stablecoin - Phase 2  
**API Version:** 1.0.0  
**Date:** November 28, 2025  
**Base URL:** `https://api.genusd.example.com/api/v1`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [KYC Endpoints](#3-kyc-endpoints)
4. [Token Operations](#4-token-operations)
5. [Policy Management](#5-policy-management)
6. [Attestation & Transparency](#6-attestation--transparency)
7. [Admin Operations](#7-admin-operations)
8. [Error Codes](#8-error-codes)

---

## 1. Overview

### 1.1 API Design Principles

- **RESTful**: Resource-oriented URLs, HTTP verbs (GET/POST/PUT/DELETE)
- **JSON**: All requests and responses use `application/json`
- **Idempotent**: Transactions with same `tx_id` processed once
- **Authenticated**: All endpoints require JWT or X.509 certificate
- **Rate Limited**: 100 requests/minute per user (KYC_LEVEL_1), 1000 req/min (KYC_LEVEL_3)

### 1.2 Common Headers

```http
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
X-Correlation-ID: <uuid>
X-Request-Timestamp: <unix_timestamp>
```

### 1.3 Response Format

**Success Response**:
```json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "timestamp": 1732752000,
    "request_id": "uuid-1234"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Input UTXOs total $500, requested transfer $1000",
    "details": {
      "available": 50000,
      "requested": 100000
    }
  },
  "metadata": {
    "timestamp": 1732752000,
    "request_id": "uuid-1234"
  }
}
```

---

## 2. Authentication

### 2.1 Obtain JWT Token

**Endpoint**: `POST /auth/login`

**Request**:
```json
{
  "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=alice",
  "signature": "SIG_base64_encoded_signature",
  "challenge": "CHALLENGE_20251128_001"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "kyc_level": "KYC_LEVEL_2"
  }
}
```

**Authentication Flow**:
1. Client requests challenge: `GET /auth/challenge`
2. Server returns random challenge string
3. Client signs challenge with private key
4. Client submits signed challenge to `/auth/login`
5. Server verifies signature, issues JWT
6. Client includes JWT in `Authorization` header for all subsequent requests

---

## 3. KYC Endpoints

### 3.1 Register New User

**Endpoint**: `POST /kyc/register`

**Description**: Submit KYC information for new user account.

**Request**:
```json
{
  "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
  "kyc_level": "KYC_LEVEL_2",
  "personal_info": {
    "full_name": "Bob Smith",
    "date_of_birth": "1990-05-15",
    "nationality": "US",
    "email": "bob@example.com",
    "phone": "+1-555-0123"
  },
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "US"
  },
  "documents": [
    {
      "type": "PASSPORT",
      "number": "US123456789",
      "expiry": "2030-12-31",
      "document_hash": "SHA256:abc123..."
    },
    {
      "type": "PROOF_OF_ADDRESS",
      "document_hash": "SHA256:def456..."
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
    "kyc_level": "KYC_LEVEL_2",
    "status": "PENDING_REVIEW",
    "daily_limit": 1000000,
    "registered_at": 1732752000
  }
}
```

**KYC Levels**:
- `KYC_LEVEL_1`: Basic (email + phone) → $1,000/day
- `KYC_LEVEL_2`: Enhanced (ID + address) → $10,000/day
- `KYC_LEVEL_3`: Institutional (full due diligence) → Unlimited

---

### 3.2 Get KYC Status

**Endpoint**: `GET /kyc/{owner_id}`

**Response**:
```json
{
  "success": true,
  "data": {
    "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
    "kyc_level": "KYC_LEVEL_2",
    "status": "APPROVED",
    "daily_limit": 1000000,
    "daily_used_today": 250000,
    "remaining_today": 750000,
    "verified_at": 1732752000,
    "expires_at": 1764288000
  }
}
```

---

### 3.3 Update KYC Information

**Endpoint**: `PUT /kyc/{owner_id}`

**Request**:
```json
{
  "address": {
    "street": "456 Oak Ave",
    "city": "Brooklyn",
    "state": "NY",
    "zip": "11201",
    "country": "US"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
    "status": "PENDING_REVIEW",
    "message": "KYC information updated, re-verification required"
  }
}
```

---

## 4. Token Operations

### 4.1 Mint Tokens (Issuer Only)

**Endpoint**: `POST /token/mint`

**Authorization**: Requires `ROLE_ISSUER`

**Request**:
```json
{
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
      "amount": 100000000,
      "kyc_tag": "KYC_LEVEL_3",
      "jurisdiction": "US"
    }
  ],
  "reserve_proof": "BANK_STATEMENT_SHA256:xyz789...",
  "memo": "Initial reserve deposit $1,000,000 USD"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tx_id": "MINT_20251128_001",
    "utxos_created": [
      {
        "utxo_id": "MINT_20251128_001:0",
        "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
        "amount": 100000000,
        "status": "active"
      }
    ],
    "total_supply_after": 100000000,
    "timestamp": 1732752000
  }
}
```

---

### 4.2 Transfer Tokens

**Endpoint**: `POST /token/transfer`

**Request**:
```json
{
  "from": "x509::/C=US/ST=CA/O=Org1/CN=alice",
  "to": "x509::/C=US/ST=NY/O=Org1/CN=bob",
  "amount": 50000,
  "memo": "Payment for invoice #INV-2025-1234"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tx_id": "TRANSFER_20251128_042",
    "inputs_spent": [
      "MINT_20251128_001:0"
    ],
    "outputs_created": [
      {
        "utxo_id": "TRANSFER_20251128_042:0",
        "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
        "amount": 50000
      },
      {
        "utxo_id": "TRANSFER_20251128_042:1",
        "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=alice",
        "amount": 99950000,
        "note": "Change UTXO"
      }
    ],
    "timestamp": 1732755600
  }
}
```

**Advanced Transfer (Manual UTXO Selection)**:
```json
{
  "inputs": ["MINT_20251128_001:0", "TRANSFER_20251127_099:1"],
  "outputs": [
    {
      "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=bob",
      "amount": 50000
    },
    {
      "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=alice",
      "amount": 149950000
    }
  ],
  "memo": "Consolidating UTXOs"
}
```

---

### 4.3 Burn Tokens (Redemption)

**Endpoint**: `POST /token/burn`

**Request**:
```json
{
  "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=alice",
  "amount": 100000,
  "bank_details": {
    "account_number": "1234567890",
    "routing_number": "021000021",
    "bank_name": "Example Bank"
  },
  "memo": "Redemption for bank wire"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tx_id": "BURN_20251128_099",
    "amount_burned": 100000,
    "fiat_payout": 99900,
    "fee": 100,
    "fee_percentage": 0.1,
    "payout_status": "PENDING",
    "estimated_settlement": "2025-11-29T14:00:00Z",
    "wire_reference": "WIRE_20251128_099"
  }
}
```

---

### 4.4 Get Balance

**Endpoint**: `GET /token/balance/{owner_id}`

**Response**:
```json
{
  "success": true,
  "data": {
    "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=alice",
    "total_balance": 99950000,
    "active_utxos": [
      {
        "utxo_id": "TRANSFER_20251128_042:1",
        "amount": 99950000,
        "created_at": 1732755600,
        "status": "active"
      }
    ],
    "frozen_balance": 0,
    "as_of": 1732760000
  }
}
```

---

### 4.5 Get Transaction History

**Endpoint**: `GET /token/transactions/{owner_id}?limit=50&offset=0`

**Query Parameters**:
- `limit`: Number of transactions (default: 50, max: 100)
- `offset`: Pagination offset
- `type`: Filter by type (`MINT`, `TRANSFER`, `BURN`)
- `start_date`: Unix timestamp
- `end_date`: Unix timestamp

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "tx_id": "TRANSFER_20251128_042",
        "type": "TRANSFER",
        "timestamp": 1732755600,
        "inputs": ["MINT_20251128_001:0"],
        "outputs": ["TRANSFER_20251128_042:0", "TRANSFER_20251128_042:1"],
        "memo": "Payment for invoice #INV-2025-1234",
        "status": "COMMITTED"
      }
    ],
    "total_count": 127,
    "page": 1,
    "total_pages": 3
  }
}
```

---

## 5. Policy Management

### 5.1 Get Current Policy

**Endpoint**: `GET /policy/current`

**Response**:
```json
{
  "success": true,
  "data": {
    "policy_version": "POLICY_V1.0",
    "issuer": "x509::/C=US/O=FederalReserve/CN=issuer",
    "effective_date": 1732752000,
    "rules": {
      "min_burn_amount": 100000,
      "max_mint_per_tx": 10000000000,
      "allowed_jurisdictions": ["US", "GB", "SG", "JP", "CH"],
      "kyc_required": true,
      "redemption_fee_percentage": 0.1
    },
    "kyc_limits": {
      "KYC_LEVEL_1": 100000,
      "KYC_LEVEL_2": 1000000,
      "KYC_LEVEL_3": 999999999999
    }
  }
}
```

---

### 5.2 Get Policy History

**Endpoint**: `GET /policy/history`

**Response**:
```json
{
  "success": true,
  "data": {
    "policies": [
      {
        "policy_version": "POLICY_V1.0",
        "effective_from": 1732752000,
        "effective_to": null,
        "status": "ACTIVE",
        "changes": "Initial policy"
      },
      {
        "policy_version": "POLICY_V0.9_BETA",
        "effective_from": 1730160000,
        "effective_to": 1732752000,
        "status": "SUPERSEDED",
        "changes": "Beta testing phase"
      }
    ]
  }
}
```

---

### 5.3 Propose Policy Update (Admin Only)

**Endpoint**: `POST /policy/propose`

**Authorization**: Requires `ROLE_ADMIN`

**Request**:
```json
{
  "policy_version": "POLICY_V1.1",
  "changes": {
    "min_burn_amount": 50000,
    "allowed_jurisdictions": ["US", "GB", "SG", "JP", "CH", "EU"]
  },
  "rationale": "Lower minimum redemption to $500, expand to EU",
  "effective_date": 1735344000
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "proposal_id": "POLICY_PROPOSAL_001",
    "policy_version": "POLICY_V1.1",
    "status": "PENDING_APPROVAL",
    "required_approvals": 3,
    "current_approvals": 0,
    "proposed_at": 1732752000
  }
}
```

---

## 6. Attestation & Transparency

### 6.1 Get Reserve Attestation

**Endpoint**: `GET /attest/reserves/latest`

**Description**: Retrieve latest cryptographic proof that total supply ≤ verified reserves.

**Response**:
```json
{
  "success": true,
  "data": {
    "attestation_id": "ATT_20251128_001",
    "attestation_type": "RESERVE_PROOF",
    "claim": {
      "statement": "Total GENUSD supply ≤ verified fiat reserves",
      "supply_commitment": "PEDERSEN:abc123def456...",
      "reserve_commitment": "PEDERSEN:xyz789ghi012..."
    },
    "proof": {
      "proof_system": "BULLETPROOFS",
      "proof_data": "BASE64:ZXhhbXBsZV9wcm9vZl9ieXRlc19oZXJl..."
    },
    "auditor": {
      "entity": "x509::/C=US/O=BigFourAuditor/CN=auditor",
      "license": "CPA-12345"
    },
    "timestamp": 1732752000,
    "signature": "SIG_AUDITOR_a1b2c3d4e5f6...",
    "verification_url": "https://verify.genusd.example.com/ATT_20251128_001"
  }
}
```

**Verification Process**:
1. Download attestation JSON from public endpoint
2. Verify `signature` using auditor's public key
3. Verify `proof` using Bulletproofs library:
   ```python
   from bulletproofs import verify_range_proof
   
   result = verify_range_proof(
       proof=attestation['proof']['proof_data'],
       commitment_supply=attestation['claim']['supply_commitment'],
       commitment_reserve=attestation['claim']['reserve_commitment']
   )
   assert result == True  # Proof valid
   ```

---

### 6.2 Get All Attestations

**Endpoint**: `GET /attest?type=RESERVE_PROOF&start_date=1730160000`

**Query Parameters**:
- `type`: Attestation type (`RESERVE_PROOF`, `KYC_AUDIT`, `COMPLIANCE_REPORT`)
- `start_date`: Unix timestamp (optional)
- `end_date`: Unix timestamp (optional)

**Response**:
```json
{
  "success": true,
  "data": {
    "attestations": [
      {
        "attestation_id": "ATT_20251128_001",
        "type": "RESERVE_PROOF",
        "timestamp": 1732752000,
        "auditor": "BigFourAuditor",
        "verification_url": "https://verify.genusd.example.com/ATT_20251128_001"
      },
      {
        "attestation_id": "ATT_20251125_001",
        "type": "RESERVE_PROOF",
        "timestamp": 1732492800,
        "auditor": "BigFourAuditor",
        "verification_url": "https://verify.genusd.example.com/ATT_20251125_001"
      }
    ],
    "total_count": 45
  }
}
```

---

### 6.3 Get Total Supply

**Endpoint**: `GET /transparency/supply`

**Description**: Public endpoint showing current circulating supply (no authentication required).

**Response**:
```json
{
  "success": true,
  "data": {
    "total_supply": 100000000,
    "total_supply_usd": 1000000.00,
    "verified_reserves": 100000000,
    "verified_reserves_usd": 1000000.00,
    "reserve_ratio": 1.0,
    "last_verified": 1732752000,
    "as_of": 1732760000
  }
}
```

---

### 6.4 Get Supply by Jurisdiction

**Endpoint**: `GET /transparency/supply/by-jurisdiction`

**Response**:
```json
{
  "success": true,
  "data": {
    "breakdown": [
      {
        "jurisdiction": "US",
        "supply": 70000000,
        "percentage": 70.0
      },
      {
        "jurisdiction": "GB",
        "supply": 20000000,
        "percentage": 20.0
      },
      {
        "jurisdiction": "SG",
        "supply": 10000000,
        "percentage": 10.0
      }
    ],
    "total_supply": 100000000,
    "as_of": 1732760000
  }
}
```

---

## 7. Admin Operations

### 7.1 Freeze UTXO

**Endpoint**: `POST /admin/freeze`

**Authorization**: Requires `ROLE_COMPLIANCE_OFFICER`

**Request**:
```json
{
  "utxo_id": "TRANSFER_20251128_042:0",
  "reason": "AML investigation case #12345",
  "case_reference": "AML-2025-1234"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "utxo_id": "TRANSFER_20251128_042:0",
    "previous_status": "active",
    "new_status": "frozen",
    "freeze_reason": "AML investigation case #12345",
    "frozen_by": "x509::/C=US/O=Org1/CN=compliance_officer",
    "frozen_at": 1732760000
  }
}
```

---

### 7.2 Unfreeze UTXO

**Endpoint**: `POST /admin/unfreeze`

**Authorization**: Requires `ROLE_COMPLIANCE_OFFICER`

**Request**:
```json
{
  "utxo_id": "TRANSFER_20251128_042:0",
  "resolution": "Investigation cleared, no suspicious activity found"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "utxo_id": "TRANSFER_20251128_042:0",
    "previous_status": "frozen",
    "new_status": "active",
    "unfrozen_by": "x509::/C=US/O=Org1/CN=compliance_officer",
    "unfrozen_at": 1732760000
  }
}
```

---

### 7.3 Blacklist Owner

**Endpoint**: `POST /admin/blacklist`

**Authorization**: Requires `ROLE_REGULATOR`

**Request**:
```json
{
  "owner_id": "x509::/C=XX/O=BadActor/CN=sanctioned_entity",
  "reason": "OFAC sanctions list",
  "reference": "OFAC-SDN-12345",
  "effective_date": 1732752000
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "owner_id": "x509::/C=XX/O=BadActor/CN=sanctioned_entity",
    "blacklisted": true,
    "utxos_frozen": 5,
    "total_amount_frozen": 250000,
    "effective_date": 1732752000,
    "blacklisted_by": "x509::/C=US/O=Treasury/CN=regulator"
  }
}
```

---

### 7.4 Get Audit Log

**Endpoint**: `GET /admin/audit?start_date=1732752000&limit=100`

**Authorization**: Requires `ROLE_AUDITOR`

**Query Parameters**:
- `start_date`: Unix timestamp
- `end_date`: Unix timestamp
- `event_type`: Filter by event (`FREEZE`, `UNFREEZE`, `BLACKLIST`, `POLICY_CHANGE`)
- `limit`: Max results (default: 100)

**Response**:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "event_id": "AUDIT_20251128_001",
        "event_type": "FREEZE",
        "timestamp": 1732760000,
        "actor": "x509::/C=US/O=Org1/CN=compliance_officer",
        "action": "Froze UTXO TRANSFER_20251128_042:0",
        "reason": "AML investigation case #12345",
        "ip_address": "192.168.1.100"
      },
      {
        "event_id": "AUDIT_20251128_002",
        "event_type": "BLACKLIST",
        "timestamp": 1732760100,
        "actor": "x509::/C=US/O=Treasury/CN=regulator",
        "action": "Blacklisted owner x509::/C=XX/O=BadActor/CN=sanctioned_entity",
        "reason": "OFAC sanctions list",
        "ip_address": "10.0.0.50"
      }
    ],
    "total_count": 234
  }
}
```

---

## 8. Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | User lacks required role/permissions |
| `NOT_FOUND` | 404 | Resource (UTXO, transaction, user) not found |
| `INVALID_REQUEST` | 400 | Malformed JSON or missing required fields |
| `INSUFFICIENT_FUNDS` | 400 | Not enough balance for transfer |
| `CONSERVATION_VIOLATION` | 400 | Input sum != Output sum in TRANSFER |
| `KYC_REQUIRED` | 403 | User must complete KYC verification |
| `KYC_INSUFFICIENT` | 403 | User's KYC level too low for operation |
| `DAILY_LIMIT_EXCEEDED` | 429 | User exceeded daily transfer quota |
| `FROZEN_UTXO` | 400 | Attempted to spend frozen UTXO |
| `BLACKLISTED` | 403 | Owner is on sanctions blacklist |
| `INSUFFICIENT_RESERVES` | 400 | Mint would exceed verified reserves |
| `BELOW_MINIMUM` | 400 | Burn amount below policy minimum |
| `INVALID_JURISDICTION` | 400 | Jurisdiction not in allowed list |
| `SIGNATURE_INVALID` | 401 | Cryptographic signature verification failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests, slow down |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

**Example Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "DAILY_LIMIT_EXCEEDED",
    "message": "Transfer amount $1,500 exceeds remaining daily limit of $750",
    "details": {
      "kyc_level": "KYC_LEVEL_2",
      "daily_limit": 1000000,
      "used_today": 250000,
      "remaining": 750000,
      "requested": 150000
    }
  },
  "metadata": {
    "timestamp": 1732760000,
    "request_id": "uuid-5678"
  }
}
```

---

## 9. Rate Limiting

| KYC Level | Requests/Minute | Burst Capacity |
|-----------|-----------------|----------------|
| LEVEL_1 | 100 | 150 |
| LEVEL_2 | 500 | 750 |
| LEVEL_3 | 1000 | 1500 |

**Rate Limit Headers**:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1732760060
```

---

## 10. Webhooks (Future Enhancement)

**Supported Events**:
- `transaction.committed`
- `utxo.frozen`
- `utxo.unfrozen`
- `owner.blacklisted`
- `policy.updated`
- `attestation.published`

**Webhook Payload Example**:
```json
{
  "event": "transaction.committed",
  "timestamp": 1732755600,
  "data": {
    "tx_id": "TRANSFER_20251128_042",
    "type": "TRANSFER",
    "amount": 50000,
    "from": "x509::/C=US/ST=CA/O=Org1/CN=alice",
    "to": "x509::/C=US/ST=NY/O=Org1/CN=bob"
  },
  "signature": "HMAC_SHA256_signature_here"
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-28 | Initial API contract specification |

---

**End of API Contract Specification**
