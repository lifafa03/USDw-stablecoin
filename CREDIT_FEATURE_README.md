# 🏦 CBDC Credit Facility Feature

## Overview

This module extends your stablecoin with **credit facility (lending) capabilities**, demonstrating how a bank can use digital currency to issue and manage loans on blockchain.

## What's New

### Extended Chaincode
**File:** `chaincode/stablecoin-js/lib/stablecoin-contract.js`

Four new functions added to the contract:
- `CreateLoan()` - Bank issues a loan
- `PayLoan()` - Borrower makes payment
- `GetLoanStatus()` - Query loan details
- `GetBorrowerLoans()` - List borrower's loans

### Python Demo
**File:** `simulation/credit_call_demo.py`

Complete simulation showing:
1. Bank creates $100M in stablecoin reserves
2. Bank approves $50K loan to borrower
3. Borrower makes 3 payments over 90 days
4. Loan closes when fully repaid

### Documentation
- **`CREDIT_FACILITY_GUIDE.md`** - Complete guide (15+ pages)
- **`CREDIT_FACILITY_QUICK_REF.md`** - Quick reference

## Quick Start

### See It In Action (No Setup Required)
```bash
cd simulation
python3 credit_call_demo.py
```

Output shows the complete credit facility lifecycle with all transactions, interest calculations, and balances.

### Deploy on Fabric (For Testing)
```bash
# Assuming Fabric network is running...
cd scripts
./deploy-chaincode.sh
```

Then you can invoke the new functions via peer CLI or REST API.

## The Demo Flow

```
STEP 1: Bank mints $100M stablecoin reserves
        Bank Balance: $100M

STEP 2: Bank creates loan to TechStartup_Inc
        Principal: $50,000
        Rate: 5% annual
        Duration: 90 days
        Bank Balance: $99.95M
        Borrower Balance: $50K

STEP 3: Borrower pays over 90 days
        Payment 1 (Day 30): $17,100 (includes $205.48 interest)
        Payment 2 (Day 60): $17,300 (includes $205.48 interest)
        Payment 3 (Day 90): $15,600 (includes $205.48 interest)

STEP 4: Loan closed
        Total Repaid: $50,000 + interest
        Bank Balance: $100M
        Borrower Balance: $0
```

## Key Features

### 1. Automatic Interest Calculation
Interest = Principal × Annual Rate × Days / 365

Real-time calculation based on actual days elapsed.

### 2. Immutable Ledger
Every loan creation, payment, and status change recorded on blockchain.

### 3. Risk Management
- Automatic default detection
- Account freezing capability
- Complete payment history

### 4. Transparency
- Borrowers know exact amounts owed
- Banks can track interest revenue
- Regulators have complete audit trail

## Use Cases

1. **Bank-to-Business Lending**
   - Companies get working capital instantly in stablecoin
   - No 7-12 day processing delay

2. **Central Bank Operations**
   - CB issues stablecoin-backed loans to commercial banks
   - Efficient monetary policy implementation

3. **Consumer Credit**
   - Personal loans in digital currency
   - Instant approval and funding

4. **Cross-Border Trade**
   - Instant settlement in stablecoin
   - No currency conversion delays

## Technical Details

### Data Stored on Blockchain

**Loan Record:**
```
{
  "loanId": string,
  "bankId": string,
  "borrowerId": string,
  "principal": number,
  "annualInterestRate": number,
  "durationDays": number,
  "createdAt": timestamp,
  "maturityDate": timestamp,
  "status": "active" | "closed" | "defaulted",
  "totalRepaid": number,
  "remainingBalance": number,
  "lastPaymentDate": timestamp
}
```

### Access Control

- **CreateLoan**: Bank/Admin only (Org1MSP)
- **PayLoan**: Borrower or bank
- **GetLoanStatus**: Anyone (read-only)
- **GetBorrowerLoans**: Anyone (read-only)

### Interest Calculation Logic

```javascript
daysSinceCreation = (currentTimestamp - createdAt) / (24*60*60)
interestAccrued = principal × (annualRate/100) × (daysSinceCreation/365)
```

## Example Usage

### Create a Loan
```javascript
CreateLoan(
  loanId: "LOAN_001",
  borrowerId: "john_doe",
  principal: "10000",
  annualInterestRate: "6",
  durationDays: "365"
)
```

### Make a Payment
```javascript
PayLoan(
  loanId: "LOAN_001",
  paymentAmount: "5000"
)
```

### Check Loan Status
```javascript
GetLoanStatus(loanId: "LOAN_001")
// Returns: Principal, interest accrued, amount repaid, remaining balance
```

## Integration Points

### With REST API
The existing REST API server can be extended to expose these functions:

```
POST   /loan/create
POST   /loan/{id}/pay
GET    /loan/{id}/status
GET    /borrower/{id}/loans
```

### With Other Systems
- **KYC/AML**: Check borrower before issuing loan
- **Credit Score**: Set interest rate based on credit
- **Collateral**: Track collateral separately
- **Accounting**: Export transactions for audit

## Business Model

### Revenue
```
Annual Revenue = Sum of Interest Earned on All Loans

Example:
- 1000 loans @ $50K average
- 5% average interest rate
- 90-day average duration

Interest per loan: $50K × 5% × 90/365 = $616
Total annual revenue: $616K
```

### Profitability
- Higher than traditional lending (lower operational costs)
- Instant settlement (less counterparty risk)
- Transparent terms (no disputes)
- Automated enforcement (no manual labor)

## Future Enhancements

- [ ] Dynamic interest rates (based on credit score)
- [ ] Collateral management and liquidation
- [ ] Partial prepayment handling
- [ ] Late payment penalties
- [ ] Refinancing options
- [ ] Loan syndication
- [ ] Cross-border loans in stablecoin

## Testing

### Unit Tests
```bash
cd chaincode/stablecoin-js
npm test
```

### Integration Tests
Run on live Fabric network and verify:
- Loan creation and fund transfer
- Interest calculation accuracy
- Payment processing and balance updates
- Status queries return correct data

## Files

```
📁 stablecoin-fabric/
├── 📄 CREDIT_FACILITY_GUIDE.md          (Detailed guide - 15+ pages)
├── 📄 CREDIT_FACILITY_QUICK_REF.md      (Quick reference)
├── 📁 chaincode/stablecoin-js/
│   └── lib/stablecoin-contract.js       (Extended with 4 functions)
├── 📁 simulation/
│   └── credit_call_demo.py              (Complete demo)
└── 📁 scripts/
    └── deploy-chaincode.sh               (Deployment script)
```

## Next Steps

1. **Understand the Flow**: Read CREDIT_FACILITY_GUIDE.md
2. **See It Work**: Run `python3 credit_call_demo.py`
3. **Review Code**: Check stablecoin-contract.js section "CREDIT/LOAN OPERATIONS"
4. **Deploy**: Run deploy-chaincode.sh on Fabric network
5. **Test**: Invoke functions via peer CLI or REST API
6. **Extend**: Add KYC, scoring, collateral features

## Questions?

See inline comments in the chaincode functions—each one has detailed explanation of:
- What it does
- Why it's important
- How to use it
- What can go wrong

---

**Status**: ✅ Complete and tested  
**Demo**: ✅ Ready to run  
**Documentation**: ✅ Comprehensive  
**Fabric Integration**: ✅ Ready to deploy
