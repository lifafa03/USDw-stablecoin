# Credit Scoring Simulation — Process Summary

Purpose: a concise, slide-ready file describing the full credit scoring simulation process you ran with `simulation/credit_scoring_demo.py`. Use this text on a slide or speaker notes in your PowerPoint.

---

**File:** `simulation/credit_scoring_demo.py`
**Location:** `/home/rsolipuram/stablecoin-fabric/simulation/credit_scoring_demo.py`

## 1) Goal of the Simulation
- Demonstrate how objective credit scoring produces different loan outcomes for three borrowers requesting the same loan amount.
- Show scoring inputs (income, balance, payment history) and resulting score, tier, approved amount, interest, and total repayment.

## 2) Prerequisites (what to have before running)
- Python 3 installed
- From repo root: run commands from `/home/rsolipuram/stablecoin-fabric`
- No Fabric network is required for this demo (the simulation is standalone Python)

## 3) Commands (how to run)
Run the simulation from the project root:

```bash
python3 simulation/credit_scoring_demo.py
```

If you want to capture output to a file for slides or attachments:

```bash
python3 simulation/credit_scoring_demo.py > results/credit_scoring_output.txt
```

Create the `results/` folder if it doesn't exist:

```bash
mkdir -p results
```

---

## 4) Step-by-step Process (what the script does)
1. Phase 1 — Register borrowers
   - Creates three example borrower profiles with different incomes, balances, and payment histories.
   - Profiles in the demo: `alice_startup`, `bob_business`, `charlie_startup`.

2. Phase 2 — Calculate credit scores
   - Uses a FICO-style scale (300-850).
   - Factors considered: payment history, income, bank balance, and debt-to-income (DTI).

3. Phase 3 — Assess a $50,000 loan request for each borrower
   - Uses score and financials to decide: approve, partially approve, or deny.
   - Computes interest and total repayment for a 90-day loan.

4. Phase 4 — Present side-by-side comparison and key insights
   - Summarizes outcomes, revenue implications, and fairness points.

---

## 5) Key Code Locations (for screenshots in slides)
- Credit scoring demo script: `simulation/credit_scoring_demo.py`
- ZK credit demo (advanced): `simulation/zk_credit_demo.py`
- Smart contract (wallet + credit functions): `chaincode/stablecoin-js/lib/stablecoin-contract.js`

Take 1–2 small screenshots for the slides:
- Screenshot 1: top portion of `credit_scoring_demo.py` showing borrower definitions
- Screenshot 2: terminal output showing the final table (score, tier, approved, interest)

---

## 6) Sample Output (paste into slide or speaker notes)
Use this compact excerpt (copy/paste) into one slide's speaker notes or a code block on the slide:

```
Credit Score Calculation (FICO-style 300-850):

   Borrower       |   Score   | Interpretation
  -----------------|-----------|---------------
   alice_startup   |   850     | Excellent
   bob_business    |   683     | Fair
   charlie_startup |   537     | Poor

Risk Assessment for $50K loan:
- alice_startup: APPROVED, $50,000 @ 5% (90-day interest: $616.44)
- bob_business: APPROVED (partial), $34,000 @ 12% (90-day interest: $1,006.03)
- charlie_startup: DENIED (score too low)
```

(Full terminal output is available in `results/credit_scoring_output.txt` if you saved it.)

---

## 7) Suggested Slide Layout (2 slides)

Slide A — "Credit Scoring: Process"
- Title: "Credit Scoring Simulation — Process"
- Bullets:
  - Create borrower profiles (income, balance, payment history)
  - Score calculation (300–850)
  - Apply same loan request ($50k)
  - Output: Approve / Partial / Deny with rates
- Speaker notes: 1–2 sentences describing that this demonstrates fairness and risk-based pricing.

Slide B — "Credit Scoring: Results"
- Title: "Credit Scoring: Results"
- Table or code block with the short sample output above.
- Speaker notes: Highlight Alice approved fully at prime rate; Bob partially approved at higher rate; Charlie denied — explain why.

---

## 8) Visuals & Talking Points (one-liners for the slide)
- "Same loan, different outcomes — fairness through objective scoring."
- "Score components: payment history (40%), income (20%), deposits (20%), DTI (20%)."
- "Why this matters: lenders manage risk; borrowers get fair pricing based on data."

---

## 9) Backup (if demo fails)
- Paste the saved output file `results/credit_scoring_output.txt` into the slide as a screenshot or copy.
- Or show pre-made static slides with the final table and the three borrower narratives.

---

## 10) Optional: Generate a short JSON summary for programmatic slides
If you want the script to emit machine-friendly JSON for inserting into slides, run a small wrapper around the demo. Example output format (copy/paste into a small JSON file):

```json
{
  "timestamp": "2025-12-10T00:27:37Z",
  "borrowers": [
    {"id":"alice_startup","score":850,"tier":"PRIME","approved":50000,"rate":0.05},
    {"id":"bob_business","score":683,"tier":"SUBPRIME","approved":34000,"rate":0.12},
    {"id":"charlie_startup","score":537,"tier":"DENIED","approved":0,"rate":null}
  ]
}
```

I can add a small wrapper script to produce this JSON if you want (tell me and I will create `simulation/credit_scoring_to_json.py`).

---

## 11) Attribution & References
- Use `IMPACT_SUMMARY.md`, `DIGITAL_WALLET_SOLUTION.md`, and `UNBANKED_BY_REGION.md` as supporting slides to show impact and real stories.
- Show `chaincode/stablecoin-js/lib/stablecoin-contract.js` for the on-chain integration slide if needed.

---

## 12) Next Steps I can do for you (choose one)
- Save the full terminal output to `results/credit_scoring_output.txt` and commit it.
- Create `simulation/credit_scoring_to_json.py` wrapper that emits JSON results.
- Generate 1–2 images (PNG) of the key output table for direct slide insertion.

Tell me which one you'd like and I'll do it next.

---

## Cross-Border Payment Addendum
This project also includes a small cross-border remittance simulation demonstrating how the USDw wallet path dramatically reduces fees and latency compared with traditional channels. Add this to your slides if you want to highlight remittances as part of the impact story.

**File:** `simulation/cross_border_payment_demo.py`

### How to run
From the repository root run:

```bash
python3 simulation/cross_border_payment_demo.py
```

Or save output to a file:

```bash
python3 simulation/cross_border_payment_demo.py > results/cross_border_output.txt
```

Create the `results/` folder if needed:

```bash
mkdir -p results
```

### What the script shows
- Compares a $100 remittance via traditional providers (3% + fixed fee, ~2 days) vs the USDw wallet path (0.01% + tiny fixed fee, ~1 minute).
- Prints a simulated wallet transfer record (tx id, timestamp, sender, recipient, amount).

### Sample output (use this snippet for slides)

```
-- Traditional Channel --
Method: Traditional (WesternUnion/Bank)
Sent: $100.0
Fee: $8.0
Received: $92.0
Time: 2 days

-- USDw Wallet Channel --
Method: USDw Wallet (instant, low-cost)
Sent: $100.0
Fee: $0.02
Received: $99.98
Time: 1 minutes

-- Simulated Wallet Transfer Record --
tx_id: tx-1765326966
timestamp: 2025-12-10T00:36:06.840139Z
from: alice_us
to: +639171234567
amount: 100.0
status: completed

Key takeaway: Wallet path saves money and time, enabling faster, cheaper remittances for unbanked recipients.
```

### Slide suggestion
- Add a single slide titled "Cross-Border Remittances"
- Left column: short bullet list describing cost & time savings
- Right column: sample output or a small table showing Traditional vs USDw costs and time

If you want, I can also insert this cross-border snippet directly into the `PRESENTATION_INSTRUCTIONS.md` or generate a PNG image of the output table for the slides. 
