## Slide 8 – Regulated Architecture: Centralized Controls on a Transparent Ledger

### Architecture Overview
- **Permissioned Core:** Hyperledger Fabric chaincode (`stablecoin-contract.js`) handles mint/burn/transfer with Org1 admin permissions.
- **Public Interface:** REST API (`app/server/server.js`) + `StablecoinClient` expose wallet-friendly HTTP endpoints and logs every call.
- **Compliance Engines:** Reserve/financing manager, Basel monitor, KYC registry, and RiskEngine embedded in Python orchestrators.
- **Data Flow:** Users → REST API → Fabric → Reserve Registry; audit logs generated at each layer.

### Why This Architecture (vs. DeFi)
1. **Regulatory Alignment (Genius Act/Basel):** Centralized issuance lets us enforce KYC, AML, capital ratios, and freeze controls—requirements that pure DeFi can’t satisfy.
2. **Treasury Custody:** USDw is backed by real Treasuries; only a regulated issuer can buy, hold, and attest those assets. Our ReserveFinancingManager models exactly how deposits/equity/credit lines fund purchases.
3. **Compliance Automation:** Embedding Basel/KYC logic in the gateway ensures actions are blocked if ratios or limits would be violated. This is essential for a bank-grade system.
4. **Audit & Transparency:** Even though control is centralized, Fabric provides immutable transaction history. We get tamper-proof logs while retaining the governance regulators expect.

Use this slide to emphasize we intentionally chose a permissioned + public hybrid: centralized controls for compliance, decentralized ledger for transparency.
