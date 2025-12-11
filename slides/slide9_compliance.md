## Slide 9 – Compliance Mechanisms: Genius Act & Basel Enforcement

### Reserve Backing & Financing
- **MockReserveRegistry:** Every USDw minted or wallet funded locks a specific Treasury lot (CUSIP, maturity, face value).
- **ReserveFinancingManager:** Tracks how each lot is funded—deposits, equity capital, or a credit line. Releases repay credit line first, keeping leverage transparent.
- **Logs:** Reserve snapshots (e.g., UST-001 used $450/$1M) and financing mix appear in `live_full_flow.log` and `live_credit_call.log`.

### Basel III Monitoring
- **BaselCompliance class:** Computes CET1, leverage ratio, and LCR in real time using treasury holdings and expected outflows.
- **Action Gates:** Mint, top-up, loan disbursement, and off-ramp requests call `can_extend_credit` / `can_accept_deposit`. Operations are blocked if ratios would fall below thresholds (4.5% CET1, 3% leverage, 100% LCR).
- **Reporting:** Summary lines printed for every demo; used in slides to prove solvency.

### KYC & Risk Controls
- **Persistent KYC Registry:** `simulation/full_flow_demo.py` loads/saves `simulation/data/kyc_registry.json`. Only `status=approved` users can off-ramp or take loans.
- **RiskEngine:** Tier-based limits (loan/top-up/remittance/off-ramp) enforced per account. Attempts beyond limits log `[RISK]` blocks.
- **Off-Ramp/Loan Flow:** KYC check + ledger burn + reserve release required before fiat payouts, satisfying AML/Genius Act expectations.

### Audit & Error Handling
- **REST Logging:** Every endpoint logs structured entries (`logTransaction`), and `StablecoinClient` stores success/failure metrics.
- **Simulation Logs:** `live_full_flow.log`, `live_credit_call.log`, `massive_bank_demo.log` capture mint → transfer → reserve release events for auditors.
- **Error Paths:** When Fabric REST is offline, scripts fall back to simulated mode but still log compliance events, ensuring dashboards show the failure.

Use this slide to demonstrate how the product stays compliant: reserve-backed, Basel-aware, KYC-enforced, and fully logged.
