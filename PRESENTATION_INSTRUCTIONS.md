# Presentation Instructions for Teammate

**Purpose:** This file gives a concise, slide-by-slide guide, speaker notes, demo commands, and rehearsal checklist so your teammate can build the PowerPoint and deliver the presentation smoothly.

**Target length:** 10-12 minutes total (adjust per class requirements)

---

**Slide 1 — Title (30s)**
- Title: "Privacy-Preserving Credit for the Unbanked"
- Subtitle: "USDw Stablecoin + Zero-Knowledge Proofs"
- Speaker notes:
  - Introduce yourself and the team (name + role)
  - One-sentence hook: "We give 1.4 billion unbanked people instant access to credit — privately and fairly."
  - Timing: 20-30s

**Slide 2 — Problem (60s)**
- Key bullets:
  - 1.4B people are unbanked
  - Barriers: geography, documentation, fees, predatory loans
  - Example: farmer who can't get $200 for seeds
- Speaker notes:
  - Use a short real story (see `UNBANKED_BY_REGION.md`) to humanize.
  - Keep statistics short and impactful.
  - Timing: 45-60s

**Slide 3 — Our Solution Overview (60s)**
- Key bullets:
  - Mobile digital wallet (zero-KYC)
  - USDw stablecoin for value storage and remittance
  - Zero-knowledge proofs to verify thresholds (income/balance) without revealing data
  - Smart contracts automate loans and scoring
- Speaker notes:
  - Explain the three pillars briefly: Wallet, ZK proofs, Smart contracts.
  - Show quick diagram if space permits.
  - Timing: 45-60s

**Slide 4 — Technology (45s)**
- Key bullets:
  - Hyperledger Fabric smart contract (`chaincode/stablecoin-js/lib/stablecoin-contract.js`)
  - Python demos: `simulation/zk_credit_demo.py`, `simulation/credit_scoring_demo.py`
  - ZK approach: commitments + nullifiers + on-chain verification
- Speaker notes:
  - Keep it high-level: no deep crypto math. Focus on benefits: privacy, replay protection, verifiability.
  - Timing: ~45s

**Slide 5 — Demo Plan (10s + run time)**
- Quick layout on what you'll show live (or video fallback):
  - Demo 1: Basic transfer/ledger (1-2 min) — shows wallet + transfer
  - Demo 2: Credit scoring demo (1-2 min) — shows how scores differ
  - Demo 3: ZK credit demo (2-3 min) — privacy-preserving proof, verified on-chain, loan issued
- Speaker notes:
  - If doing live demos: say you will run each script and explain output.
  - If no live demo: prepare a short recorded video/screencast.

**Slide 6 — Demo: Basic (live or recorded, 1-2 min)**
- What to run:
  - `python3 simulation/credit_call_demo.py` (basic lifecycle)
- What to highlight:
  - Account creation, minting, simple transfer
  - How ledger shows transaction history
- Speaker notes:
  - Explain that this establishes the baseline (how the ledger and wallet work)

**Slide 7 — Demo: Credit Scoring (live or recorded, 1-2 min)**
- What to run:
  - `python3 simulation/credit_scoring_demo.py`
- What to highlight:
  - Different borrower profiles (Alice / Bob / Charlie)
  - How objective factors change outcomes
- Speaker notes:
  - Emphasize fairness of multi-factor model and the observable outputs (scores, tiers)

**Slide 8 — Demo: ZK Credit Flow (live or recorded, 2-3 min)**
- What to run:
  - `python3 simulation/zk_credit_demo.py`
- What to highlight in output:
  - ZK proof generation (commitments/nullifiers)
  - On-chain verification result (valid/invalid)
  - Final approved loan and non-disclosure of raw data
- Speaker notes:
  - Reinforce privacy benefit: we prove thresholds (e.g., "income ≥ $3k") without revealing exact amounts.
  - Show line in output that indicates score and loan approval.

**Slide 9 — Digital Wallet & Inclusion (45s)**
- Key bullets:
  - Zero-KYC onboarding (phone + biometric)
  - Mobile-money integration (M-Pesa, GCash)
  - Low-cost transfers and cross-border remittances
- Speaker notes:
  - Reference `DIGITAL_WALLET_SOLUTION.md` for the farmer story.
  - Quick cost comparison (traditional remittance vs wallet).

**Slide 10 — Business & Impact (45s)**
- Key bullets:
  - Economic impact metrics (wallet growth, loans disbursed)
  - Social outcomes (schooling, business expansion)
  - Revenue model (small service fees, lending interest, optional premium services)
- Speaker notes:
  - Emphasize the social ROI — not just revenue.
  - Use small numbers to keep claims plausible (refer to `IMPACT_SUMMARY.md`).

**Slide 11 — Roadmap & Next Steps (30s)**
- Key bullets:
  - Pilot in target region (pick one from `UNBANKED_BY_REGION.md`)
  - Regulatory & compliance checks
  - UX & localization improvements
  - Security audit and scale testing
- Speaker notes:
  - Keep this realistic and show immediate next steps.

**Slide 12 — Q&A & Backup Slides (Remaining time)**
- Prepare 3-5 backup slides (short answers):
  - How ZK proofs prevent fraud
  - Privacy and GDPR concerns
  - On-chain cost and throughput
  - How identity works without formal ID
- Speaker notes:
  - Have the backup slides ready and numbered.
  - If a demo fails, switch to these slides immediately.

---

## Speaker Tips & Timing
- Opening hook: 15–20 seconds
- Problem + solution: 2 minutes
- Demos: 4–6 minutes (if live) — keep each demo < 3 minutes
- Impact + business: 1.5 minutes
- Roadmap + Q&A: 1.5–2 minutes
- Practice run: 2 full practice runs with a teammate
- Bring a backup: record demos as short videos and have them ready

## Demo Run Commands (quick reference)
- Basic: `python3 simulation/credit_call_demo.py`
- Scoring: `python3 simulation/credit_scoring_demo.py`
- ZK Credit: `python3 simulation/zk_credit_demo.py`

Note: run from repository root: `/home/rsolipuram/stablecoin-fabric`.

## Technical Notes for Live Demo (cheat sheet)
- If the demo needs the Fabric network running, either:
  - Use pre-recorded outputs; or
  - Start the Fabric test network (if set up locally) before the talk.
- File references:
  - Smart contract: `chaincode/stablecoin-js/lib/stablecoin-contract.js`
  - Wallet design: `DIGITAL_WALLET_SOLUTION.md`
  - Impact narrative: `IMPACT_SUMMARY.md`, `UNBANKED_BY_REGION.md`

## Rehearsal Checklist (do these before presenting)
- [ ] Run each demo start-to-end and record output
- [ ] Create 1-minute video backup of each demo
- [ ] Time the talk to fit 10-12 minutes
- [ ] Ensure slide deck has clear, readable fonts and visuals
- [ ] Mark the slide that triggers each demo
- [ ] Have the repo open to show a code file briefly (don’t read code)
- [ ] Practice transitions between tech and impact sections

## Quick Q&A Script (short answers)
- Q: Why ZK proofs? — A: Privacy + verification. We verify minimums without revealing raw data.
- Q: How do you prevent fraud? — A: Nullifiers prevent proof replay; daily limits and biometric recovery limit scams.
- Q: What about regulation? — A: Pilot with local mobile-money partners, implement KYC as required by jurisdictions.
- Q: Can people recover accounts? — A: Yes: phone + biometric-based recovery.

---

## Deliverables for Teammate
- A clean PowerPoint with slides matching the above structure
- Embed demo videos (1-2 min each) as fallback
- Speaker notes copied from this file
- Keep slides visually simple: 3–5 bullets per slide, one diagram or screenshot max


Good luck — if you want I can also generate a starter `pptx` file with these slides (I can do that next).