## Slide 10 – Funding Sources & Basel III Discipline

### Funding Stack for Treasuries
- **Deposits** – Customer on-ramp cash feeds `ReserveFinancingManager`; minting USDw immediately locks Treasuries with deposit funding.
- **Equity Capital** – Seed pool (1M USD) backs initial reserve purchases and satisfies CET1 requirements.
- **Credit Line / Repo** – Simulated $5M facility provides peak liquidity. `ReserveFinancingManager` records drawdowns and repayments after each loan repayment/off-ramp.

### Why This Matters
- **Realistic Treasury Custody** – Stablecoins pegged 1:1 must hold Treasuries; showing deposits/equity/debt mix proves we considered practical financing.
- **Transparent Leverage** – Logs (e.g., `[FINANCE] Repaid $17,100 to credit line... Remaining credit drawn: $4,982,900`) show exactly when leverage is used.
- **Compliance with Basel III** – Basel monitor uses funding data to compute CET1/leverage/LCR. Actions (loan/top-up) are refused if ratios would breach thresholds.

### Evidence in Logs
- `live_credit_call.log`: shows warning when deposits/equity can’t cover purchase, auto-issues new lot, and records credit-line usage + repayment.
- `live_full_flow.log`: prints Basel ratios alongside financing mix (deposits $2,000,050, equity $1,000,000, credit drawn $0).
- `massive_bank_demo.log`: demonstrates that even with many customers, reserve capacity remains >$1.7M, supporting Basel compliance narrative.

Use this slide to explain that funding and Basel compliance aren’t afterthoughts—they’re coded into the system’s core.
