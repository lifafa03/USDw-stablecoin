# Credit Facility Demo: CBDC-Based Lending System

## Project Overview

This is a **complete demonstration of a bank credit facility using a stablecoin** built on Hyperledger Fabric. It demonstrates how a Central Bank Digital Currency (CBDC) can be used for credit operations—a key use case for digital currencies in modern banking.

### What This Solves

In traditional banking:
- Credit terms are stored in databases (not transparent)
- Loan origination takes days/weeks
- Interest calculations can be disputed
- There's no immutable audit trail

With stablecoin + blockchain:
- **Smart contract enforces terms automatically** (code = agreement)
- **Instant settlement** (no intermediaries needed)
- **Transparent interest calculations** (math is verifiable)
- **Immutable record** (permanent audit trail)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Python Demo Script                          │
│         (Simulates credit facility lifecycle)                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│              Hyperledger Fabric Chaincode                       │
│  New Credit Functions:                                          │
│  - CreateLoan() - Bank creates loan with terms                 │
│  - PayLoan() - Borrower makes payment                          │
│  - GetLoanStatus() - Query loan details & interest             │
│  - GetBorrowerLoans() - List all loans for borrower            │
└────────────────────┬────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────┐
│          Hyperledger Fabric Test Network                        │
│  - 2 Organizations (Org1, Org2)                                │
│  - 2 Peers (peer0.org1, peer0.org2)                           │
│  - 1 Orderer (orderer.example.com)                            │
│  - Channel: mychannel                                          │
│  - World State: Account & Loan records                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Credit Facility Flow

### Phase 1: Bank Establishes Capital
```
Action: Bank mints $100,000,000 in stablecoin reserves
Result: Bank balance = $100,000,000
Purpose: Bank now has capital available to lend
```

**Blockchain Record:**
- Transaction ID: MINT_2025
- Timestamp: 2025-12-04 15:54:06
- Account: bank
- Amount: $100,000,000
- New Total Supply: $100,000,000

---

### Phase 2: Bank Approves Credit Facility

```
Bank → TechStartup_Inc: $50,000 loan
Terms:
  - Principal: $50,000
  - Annual Interest Rate: 5%
  - Duration: 90 days
  - Expected Repayment: $50,616.44
    (= $50,000 principal + $616.44 interest)
```

**Blockchain Records:**
1. Loan Created:
   - Loan ID: LOAN_2025_001
   - Status: ACTIVE
   - Stored on ledger as immutable record

2. Principal Transferred:
   - Bank balance: $99,950,000 (reduced by $50,000)
   - TechStartup balance: $50,000 (increased by $50,000)

---

### Phase 3: Borrower Makes Payments

The borrower repays the loan over 90 days with three installment payments:

#### Payment 1 (Day 30)
```
Date: 2026-01-03
Payment: $17,100
  - Principal component: $16,894.52
  - Interest component: $205.48 (interest accrued over 30 days)

Account Balances After Payment:
  - Bank Balance: $99,967,100
  - TechStartup Balance: $32,900
  - Loan Remaining: $32,900
```

#### Payment 2 (Day 60)
```
Date: 2026-02-02
Payment: $17,300
  - Principal component: $17,094.52
  - Interest component: $205.48 (additional interest for 30 days)

Account Balances After Payment:
  - Bank Balance: $99,984,400
  - TechStartup Balance: $15,600
  - Loan Remaining: $15,600
```

#### Payment 3 (Day 90 - Maturity)
```
Date: 2026-03-04
Payment: $15,600 (final payment)
  - Principal component: $15,394.52
  - Interest component: $205.48 (final interest)

Account Balances After Payment:
  - Bank Balance: $100,000,000
  - TechStartup Balance: $0
  - Loan Status: CLOSED
```

---

### Phase 4: Final Settlement

**Loan Summary:**
```
Loan ID:              LOAN_2025_001
Status:               CLOSED
Principal:            $50,000
Annual Rate:          5%
Duration:             90 days
Total Repaid:         $50,000
Total Interest:       ~$616 (prorated)
Maturity Date:        2026-03-04
Risk Assessment:      LOW RISK (Full repayment)
```

**Blockchain Audit Trail:**
```
Transaction 1: MINT - Bank creates reserves
  Time: 2025-12-04 15:54:06
  Amount: $100,000,000
  
Transaction 2: CREATE_LOAN - Bank issues loan
  Time: 2025-12-04 15:54:06
  From: bank → To: TechStartup_Inc
  Amount: $50,000
  
Transaction 3: PAY_LOAN - Payment 1
  Time: (Day 30)
  From: TechStartup_Inc → To: bank
  Amount: $17,100
  
Transaction 4: PAY_LOAN - Payment 2
  Time: (Day 60)
  From: TechStartup_Inc → To: bank
  Amount: $17,300
  
Transaction 5: PAY_LOAN - Payment 3
  Time: (Day 90)
  From: TechStartup_Inc → To: bank
  Amount: $15,600
```

---

## Smart Contract Functions

The extended chaincode includes four new functions:

### 1. CreateLoan(loanId, borrowerId, principal, annualRate, durationDays)
**Who can call:** Bank (Admin/Org1MSP only)

Creates a new loan agreement and transfers principal to borrower.

```javascript
CreateLoan(
  "LOAN_2025_001",      // Unique loan ID
  "TechStartup_Inc",    // Borrower
  "50000",              // Principal amount
  "5",                  // Annual interest rate
  "90"                  // Duration in days
)
```

**Returns:**
```json
{
  "loanId": "LOAN_2025_001",
  "borrowerId": "TechStartup_Inc",
  "principal": 50000,
  "annualInterestRate": 5,
  "durationDays": 90,
  "status": "active",
  "borrowerNewBalance": 50000
}
```

**Blockchain Changes:**
- Creates loan record in world state
- Deducts $50,000 from bank balance
- Adds $50,000 to borrower balance

---

### 2. PayLoan(loanId, paymentAmount)
**Who can call:** Borrower

Makes a payment on the loan. Smart contract automatically:
- Validates payment amount
- Calculates accrued interest
- Updates loan status
- Transfers funds

```javascript
PayLoan(
  "LOAN_2025_001",  // Loan to pay
  "17100"           // Payment amount
)
```

**Returns:**
```json
{
  "loanId": "LOAN_2025_001",
  "paymentAmount": 17100,
  "interestAccrued": 205.48,
  "totalRepaid": 17100,
  "remainingBalance": 32900,
  "status": "active",
  "borrowerNewBalance": 32900,
  "bankNewBalance": 99967100
}
```

**Smart Contract Validations:**
- ✓ Loan exists and is active
- ✓ Payment doesn't exceed remaining balance
- ✓ Borrower has sufficient stablecoin
- ✓ Interest calculation is correct

---

### 3. GetLoanStatus(loanId)
**Who can call:** Anyone (read-only query)

Returns complete loan information including current interest accrued.

```javascript
GetLoanStatus("LOAN_2025_001")
```

**Returns:**
```json
{
  "loanId": "LOAN_2025_001",
  "bankId": "bank",
  "borrowerId": "TechStartup_Inc",
  "principal": 50000,
  "annualInterestRate": 5,
  "durationDays": 90,
  "createdAt": 1733321646,
  "maturityDate": 1741011246,
  "status": "active",
  "daysSinceCreation": 30,
  "interestAccrued": 205.48,
  "totalOwed": 50205.48,
  "totalRepaid": 17100,
  "remainingBalance": 33105.48,
  "lastPaymentDate": 1735900046
}
```

**Key Insight:** Interest is calculated **in real-time** based on days elapsed, not predetermined payments.

---

### 4. GetBorrowerLoans(borrowerId)
**Who can call:** Anyone (read-only query)

Lists all loans (active and closed) for a borrower.

```javascript
GetBorrowerLoans("TechStartup_Inc")
```

**Returns:**
```json
{
  "borrowerId": "TechStartup_Inc",
  "loanCount": 1,
  "loans": [
    {
      "loanId": "LOAN_2025_001",
      "principal": 50000,
      "status": "closed",
      "totalRepaid": 50000,
      ...
    }
  ]
}
```

---

## Key Features Demonstrated

### 1. **Automatic Interest Calculation**
```
Interest = Principal × Annual Rate × Days Elapsed / 365

Example:
$50,000 × 5% × 30 days / 365 = $205.48
```

The smart contract calculates this in real-time, not using predetermined schedules.

---

### 2. **Immutable Audit Trail**
Every transaction (loan creation, payment, status update) is recorded on the blockchain with:
- Timestamp
- Transaction ID
- Account balances before/after
- All participants

**Cannot be altered or deleted** - provides regulatory compliance.

---

### 3. **Risk Assessment**
System automatically evaluates:
- **Default Risk**: If payment not made by maturity
- **Repayment Verification**: All payments recorded on blockchain
- **Interest Earned**: Bank revenue from lending

---

### 4. **Transparent Terms**
Unlike traditional banking where loan terms are stored in a database (subject to human error/fraud), here:
- Terms are **encoded in smart contract code**
- Execution is **automatic and trustless**
- No disputes about calculations possible

---

## Running the Demo

### Start the Fabric Network
```bash
cd fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca
```

### Deploy the Extended Chaincode
```bash
cd ../../scripts
./deploy-chaincode.sh
```

### Run the Credit Facility Simulation
```bash
cd ../simulation
python3 credit_call_demo.py
```

---

## Use Cases for CBDC Credit Facilities

### 1. **Central Bank Lending to Commercial Banks**
- Central bank issues stablecoin
- Commercial banks borrow against reserves
- Interest paid back to central bank
- Immediate settlement eliminates overnight risk

### 2. **Bank-to-Business Lending**
- Small businesses get loans in stablecoin
- No traditional banking delays
- Transparent interest terms
- Blockchain record for regulatory compliance

### 3. **Peer-to-Peer Lending**
- Individuals lend stablecoin to each other
- Smart contract enforces repayment
- Interest automatically calculated
- Both parties have immutable proof of agreement

### 4. **Trade Finance**
- Exporter gets loan for goods
- Importer pays when goods received
- Stablecoin settlement is instant
- All terms encoded in smart contract

---

## Business Model Insights

### Bank Revenue
```
Revenue = Interest Earned on All Loans
        = (Principal × Rate × Duration / 365) × Number of Loans

Example from Demo:
- Principal: $50,000
- Rate: 5%
- Duration: 90 days
- Interest Revenue: ~$616
```

### Risk Management
```
Bad Actors (Default):
- Cannot borrow again (reputation/blockchain record)
- Account can be frozen
- Collateral management (future enhancement)

Good Actors (Repay on Time):
- Build credit history
- Access to larger loans
- Better interest rates (dynamic pricing)
```

### Efficiency Gains
```
Traditional Bank Loan:
- Application to approval: 5-10 days
- Funding: 1-2 days
- Total: 7-12 days

CBDC Stablecoin Loan:
- Application to funding: Minutes
- Savings: 99% faster
```

---

## Technical Implementation

### Data Structure (World State)

**Loan Record:**
```json
{
  "loanId": "LOAN_2025_001",
  "bankId": "bank",
  "borrowerId": "TechStartup_Inc",
  "principal": 50000,
  "annualInterestRate": 5,
  "durationDays": 90,
  "createdAt": 1733321646,
  "maturityDate": 1741011246,
  "status": "active|closed|defaulted",
  "totalRepaid": 17100,
  "remainingBalance": 32900,
  "lastPaymentDate": 1735900046,
  "metadata": {
    "description": "Loan agreement between bank and TechStartup_Inc"
  }
}
```

**Composite Key:**
```
Key: "loan"~"LOAN_2025_001"
Value: {loan object as JSON}
```

---

## Security & Compliance

### Access Control
- Only `Org1MSP` (bank) can create loans
- Only the borrower can make payments
- Anyone can query loan status (transparency)

### Data Integrity
- All calculations stored on blockchain
- Cannot modify historical records
- Timestamp proof of all transactions

### Regulatory Compliance
- Complete audit trail (FinCEN, FATF requirements)
- KYC/AML can be added to CreateLoan
- Sanctions screening integration possible

---

## Class Presentation Guide

### Slide 1: Problem Statement
"How does CBDC enable instant credit?"

### Slide 2: Traditional vs. Blockchain
```
Traditional Bank Lending:
- 7-12 days to get a loan
- Interest disputes possible
- No transparency
- Manual processes

Blockchain-Based CBDC Lending:
- Minutes to get a loan
- Interest automatically calculated
- Complete transparency
- Automated smart contracts
```

### Slide 3: Architecture
[Show the diagram above]

### Slide 4: The Demo Flow
[Show the 4-phase flow]

### Slide 5: Live Demo
Run `python3 credit_call_demo.py` and show output

### Slide 6: Key Takeaways
1. Smart contracts enforce loan terms automatically
2. Stablecoin enables instant settlement
3. Blockchain provides immutable audit trail
4. Banks can offer credit instantly
5. Interest calculations are transparent
6. Regulatory compliance built-in

### Slide 7: Future Enhancements
- Dynamic interest rates (based on borrower credit score)
- Collateral management
- Automated default procedures
- Cross-border lending
- Partial prepayment handling

---

## Files Created/Modified

### Modified
- `/chaincode/stablecoin-js/lib/stablecoin-contract.js` - Added 4 new functions

### Created
- `/simulation/credit_call_demo.py` - Complete demo script
- `/docs/CREDIT_FACILITY_GUIDE.md` - This documentation

---

## Testing the Chaincode (Manual)

### 1. Check Bank Balance
```bash
peer chaincode query -C mychannel -n stablecoin \
  -c '{"function":"BalanceOf","Args":["bank"]}'
```

### 2. Mint Reserves
```bash
peer chaincode invoke -C mychannel -n stablecoin \
  -c '{"function":"Mint","Args":["bank","100000000"]}'
```

### 3. Create Loan
```bash
peer chaincode invoke -C mychannel -n stablecoin \
  -c '{"function":"CreateLoan","Args":["LOAN_2025_001","TechStartup_Inc","50000","5","90"]}'
```

### 4. Get Loan Status
```bash
peer chaincode query -C mychannel -n stablecoin \
  -c '{"function":"GetLoanStatus","Args":["LOAN_2025_001"]}'
```

### 5. Make Payment
```bash
peer chaincode invoke -C mychannel -n stablecoin \
  -c '{"function":"PayLoan","Args":["LOAN_2025_001","17100"]}'
```

---

## Conclusion

This credit facility demo showcases how CBDC and blockchain technology can revolutionize lending:

✅ **Instant credit** (no days of processing)
✅ **Transparent terms** (code = contract)
✅ **Automated enforcement** (no human error)
✅ **Immutable records** (regulatory compliance)
✅ **Efficient settlement** (seconds, not days)

The future of banking is programmable money on blockchains.

---

## Questions?

See the inline comments in `stablecoin-contract.js` for detailed explanations of every function.
