# Phase 4 Implementation Plan - Production Hardening

## Status: IN PROGRESS
**Start Date:** November 29, 2025

## Overview
Phase 4 replaces all mock implementations with production-grade components while maintaining API compatibility with Phase 3.

## Implementation Tracker

### ✅ Already Completed (Phase 3.5)
- [x] Real ZK-STARK verification (`SimpleSTARKVerifier` with 128-bit security)
- [x] FRI protocol (40 query rounds)
- [x] Fiat-Shamir heuristic
- [x] Merkle tree authentication
- [x] Polynomial commitment verification

### 🔄 Phase 4 Components (To Implement)

#### 1. Real Dilithium Post-Quantum Signatures
- [ ] Integrate PQClean or liboqs library
- [ ] Replace `generateMockSignature` with real Dilithium signing
- [ ] Replace `Verify()` mock logic with real verification
- [ ] Update `SignMessage()` to use real Dilithium
- [ ] Create HSM-friendly KeyManager abstraction
- [ ] Add comprehensive unit tests (valid/invalid signatures)
- [ ] Update governance to enforce real PQ signatures

**Files to modify:**
- `chaincode/genusd-chaincode/pqcrypto/pqverify.go`
- `chaincode/genusd-chaincode/genusd/contract.go` (remove TODO comments)
- `chaincode/genusd-chaincode/governance/governance.go`

#### 2. Real KYC Validation
- [ ] Create KYC microservice/module (`kyc/kyc_service.go`)
- [ ] Implement KYC registration endpoint
- [ ] Implement KYC status checking
- [ ] Add blacklist enforcement
- [ ] Integrate with chaincode operations (Mint/Transfer/Burn)
- [ ] Add KYC database (SQLite/Postgres abstraction)
- [ ] Create REST API endpoints (`/kyc/register`, `/kyc/status/:userId`)
- [ ] Add KYC validation tests

**New files to create:**
- `chaincode/genusd-chaincode/kyc/kyc_service.go`
- `chaincode/genusd-chaincode/kyc/kyc_models.go`
- `chaincode/genusd-chaincode/kyc/kyc_test.go`
- `app/server/kyc_routes.js`

#### 3. Rate Limiting & Transaction Fees
- [ ] Add express-rate-limit middleware
- [ ] Configure rate limit buckets (read vs write endpoints)
- [ ] Implement transaction fee calculation
- [ ] Add rate limit headers (X-RateLimit-*)
- [ ] Log rate limit violations
- [ ] Add fee metadata to transactions
- [ ] Create rate limit tests

**Files to modify:**
- `app/server/server.js`
- `app/server/fabric-client.js`

#### 4. Multisig Governance
- [ ] Create governance proposal system
- [ ] Implement M-of-N multisig (2-of-3 default)
- [ ] Add proposal creation/approval/execution workflow
- [ ] Define high-risk actions requiring multisig
- [ ] Add proposal replay protection
- [ ] Create multisig tests
- [ ] Document multisig workflow

**New files to create:**
- `chaincode/genusd-chaincode/governance/multisig.go`
- `chaincode/genusd-chaincode/governance/multisig_test.go`

**Files to modify:**
- `chaincode/genusd-chaincode/governance/governance.go`

#### 5. HSM-Friendly Key Management
- [ ] Create KeyManager interface
- [ ] Implement default file-based KeyManager
- [ ] Create PKCS#11/Cloud KMS adapter stub
- [ ] Wire chaincode to use KeyManager
- [ ] Add key rotation documentation
- [ ] Create key management tests

**New files to create:**
- `chaincode/genusd-chaincode/keymanager/interface.go`
- `chaincode/genusd-chaincode/keymanager/file_manager.go`
- `chaincode/genusd-chaincode/keymanager/hsm_adapter.go`
- `chaincode/genusd-chaincode/keymanager/keymanager_test.go`

#### 6. Tests & Documentation
- [ ] Update all unit tests for new components
- [ ] Add integration tests (end-to-end flows)
- [ ] Update Phase 4 documentation
- [ ] Update API documentation
- [ ] Update deployment guides
- [ ] Create Phase 4 completion report
- [ ] Verify CI/CD passes

**Documentation files to update:**
- `PHASE4_COMPLETION.md` (create)
- `API_REFERENCE.md`
- `PRODUCTION_UPGRADES.md`
- `README.md`

## Implementation Order

1. **KeyManager** (Foundation for everything else)
2. **Real Dilithium** (Critical security component)
3. **Multisig Governance** (Depends on real Dilithium)
4. **KYC Service** (Independent module)
5. **Rate Limiting** (API layer, independent)
6. **Tests & Documentation** (Final validation)

## Success Criteria

✅ All Phase 3 functionality preserved
✅ No public API changes
✅ All mock code replaced or clearly deprecated
✅ Real cryptographic verification in place
✅ All tests passing
✅ Documentation updated
✅ CI/CD green
✅ Production-ready deployment guide

## Notes

- **ZK-STARK**: Already using real verification (SimpleSTARKVerifier)
- **Compatibility**: Must maintain backward compatibility with Phase 3 APIs
- **Incremental**: Each component should compile and test independently
- **Security**: All privileged operations must use real cryptography

## Timeline Estimate

- KeyManager: 2-3 hours
- Real Dilithium: 4-6 hours (library integration)
- Multisig Governance: 3-4 hours
- KYC Service: 4-5 hours
- Rate Limiting: 1-2 hours
- Tests & Docs: 3-4 hours

**Total: 17-24 hours** (2-3 development days)

## Risk Mitigation

1. Keep mock implementations as fallback during development
2. Use feature flags for gradual rollout
3. Extensive testing before removing mocks
4. Clear documentation of breaking changes (if any)
