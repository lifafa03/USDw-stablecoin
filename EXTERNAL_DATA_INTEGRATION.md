# How Banks Access External Data (Income, Bank Balances, etc.)

## The Real Problem

Your system currently **trusts the borrower to provide their own data**:
```javascript
RegisterBorrower(borrowerId, annualIncome, bankAccountBalance)
```

But in real life: **You can't trust borrowers to tell the truth!**
- Borrower lying: "I make $500K/year" (actually $50K)
- Inflated savings: "I have $1M in the bank" (actually $10K)
- Hidden debts: Not disclosing other loans

**How do real banks verify this?** They use external data sources.

---

## 1. **Direct Bank Connections (Most Secure)**

### How It Works:
- Your bank connects directly to **other banks' systems** via secure APIs
- Example: JPMorgan queries Bank of America's API: "Give me balance for account XYZ"
- Uses industry standards: **SWIFT, ACH, or proprietary APIs**

### In Your System:
```javascript
async VerifyBankBalance(ctx, borrowerId, bankName, accountNumber) {
    // Call external bank's API
    const externalAPI = "https://api.bankofamerica.com/verify";
    
    const response = await fetch(externalAPI, {
        method: "POST",
        headers: { "Authorization": "Bearer SECURE_TOKEN" },
        body: JSON.stringify({
            accountNumber: accountNumber,
            requestingBank: "YOUR_BANK",
            borrowerId: borrowerId
        })
    });
    
    const { balance, verified } = await response.json();
    
    // Store verified data on blockchain
    ctx.stub.putState(
        `verified_balance_${borrowerId}`,
        Buffer.from(JSON.stringify({
            balance: balance,
            verifiedAt: new Date(),
            source: bankName,
            verified: true
        }))
    );
    
    return { balance, verified };
}
```

### Pros:
- ✅ Most accurate
- ✅ Real-time data
- ✅ Secure

### Cons:
- ❌ Requires banking partnerships
- ❌ Expensive to set up
- ❌ Limited to participating banks
- ❌ Regulatory compliance needed

---

## 2. **Third-Party Data Providers (Most Common)**

### How It Works:
- Banks subscribe to credit reporting agencies
- Agencies aggregate data from many sources
- Your bank queries: "Give me credit report for John Doe"

### Examples:
- **Equifax, Experian, TransUnion** (US credit bureaus)
- **Plaid** (connects to 12,000+ financial institutions)
- **China's PBOC** (People's Bank of China - government-run)

### In Your System:
```javascript
async VerifyIncomeViaPlaid(ctx, borrowerId, plaidToken) {
    // Plaid has already linked user's bank
    const plaidAPI = "https://sandbox.plaid.com/income/verification/verify";
    
    const response = await fetch(plaidAPI, {
        method: "POST",
        body: JSON.stringify({
            client_id: PLAID_CLIENT_ID,
            secret: PLAID_SECRET,
            access_token: plaidToken
        })
    });
    
    const {
        verified_income,
        verified_balances,
        verified_transactions
    } = await response.json();
    
    // Store on blockchain with source verification
    ctx.stub.putState(
        `verified_income_${borrowerId}`,
        Buffer.from(JSON.stringify({
            income: verified_income,
            source: "Plaid",
            timestamp: new Date(),
            confidence: "high",
            automaticVerification: true
        }))
    );
    
    return verified_income;
}
```

### Pros:
- ✅ Already integrated with thousands of banks
- ✅ Fast to implement
- ✅ No special partnerships needed

### Cons:
- ❌ Fees per verification
- ❌ Depends on user linking account
- ❌ Not available in all countries

---

## 3. **Government Records (Free but Slow)**

### How It Works:
- Tax returns (W-2, 1099)
- Social Security records
- Government employment databases

### In Your System:
```javascript
async VerifyIncomeViaTaxReturn(ctx, borrowerId, taxReturnHash) {
    // taxReturnHash = cryptographic hash of verified tax document
    // User provides scanned/certified tax return
    
    // Validate hash matches official government records
    const governmentAPI = "https://api.irs.gov/verify";
    
    const response = await fetch(governmentAPI, {
        method: "POST",
        body: JSON.stringify({
            documentHash: taxReturnHash,
            ssn: borrowerId,
            year: new Date().getFullYear() - 1
        })
    });
    
    const { verified, reportedIncome } = await response.json();
    
    if (verified) {
        ctx.stub.putState(
            `verified_income_tax_${borrowerId}`,
            Buffer.from(JSON.stringify({
                income: reportedIncome,
                source: "IRS_Tax_Return",
                year: new Date().getFullYear() - 1,
                verified: true,
                timestamp: new Date()
            }))
        );
    }
    
    return { verified, income: reportedIncome };
}
```

### Pros:
- ✅ Official source
- ✅ Free
- ✅ Legal requirement

### Cons:
- ❌ Slow (can take days)
- ❌ Only annual data
- ❌ Not real-time
- ❌ Only available in some countries

---

## 4. **Employer Verification (Growing Trend)**

### How It Works:
- Direct connection to employer's HR system
- Employer confirms: "Yes, John works here, earns $80K/year"
- Real-time employment verification

### In Your System:
```javascript
async VerifyEmploymentViaEmployer(ctx, borrowerId, employerId) {
    // Direct API call to employer's system
    const employerAPI = `https://${employerId}.api.verification.com/verify-employment`;
    
    const response = await fetch(employerAPI, {
        method: "POST",
        headers: { "Authorization": "Bearer EMPLOYER_SECRET" },
        body: JSON.stringify({
            employeeId: borrowerId,
            requestingInstitution: "YOUR_BANK"
        })
    });
    
    const {
        employed,
        salary,
        startDate,
        department
    } = await response.json();
    
    if (employed) {
        ctx.stub.putState(
            `verified_employment_${borrowerId}`,
            Buffer.from(JSON.stringify({
                employer: employerId,
                salary: salary,
                employed: true,
                startDate: startDate,
                verified: true,
                timestamp: new Date()
            }))
        );
    }
    
    return { employed, salary };
}
```

### Pros:
- ✅ Real-time
- ✅ Hard to fake
- ✅ Current employment status

### Cons:
- ❌ Privacy concerns
- ❌ Not all employers participate
- ❌ Breaks if employee switches jobs

---

## 5. **Blockchain-Based Verification (Future)**

### How It Works:
- All banks are on same blockchain network
- Other banks post verified customer data on-chain
- Your bank queries: "Give me verified income for John"

### In Your System:
```javascript
async QueryBlockchainForVerifiedData(ctx, borrowerId, dataType) {
    // Query another bank's records on same blockchain
    
    // This already exists if all banks on Hyperledger Fabric!
    const otherBankKey = `verified_${dataType}_${borrowerId}_BANK_OF_AMERICA`;
    
    try {
        const result = await ctx.stub.getState(otherBankKey);
        if (result && result.length > 0) {
            const data = JSON.parse(result.toString());
            
            // Verify signature from other bank
            if (this._verifyBankSignature(data)) {
                return {
                    verified: true,
                    data: data,
                    source: "BANK_OF_AMERICA",
                    confidence: "highest"
                };
            }
        }
    } catch (error) {
        // Data not found or invalid
    }
    
    return { verified: false };
}
```

### Pros:
- ✅ Instant
- ✅ Cryptographically verified
- ✅ Immutable
- ✅ No fees

### Cons:
- ❌ Requires all banks on same network
- ❌ Privacy concerns
- ❌ Regulatory hurdles
- ❌ Doesn't exist yet (this is the dream!)

---

## What Major Banks Actually Use

### JPMorgan, Goldman Sachs, BofA:
1. **Plaid** for consumer banking data
2. **Equifax/Experian** for credit history
3. **Internal partnerships** with other banks
4. **Tax returns** for income verification
5. **Employment verification services** (The Work Number, etc.)

### Chinese Banks (Alipay, WeChat Pay):
1. **Government data** (linked directly to Chinese government)
2. **Social credit score** (combines financial + behavior data)
3. **Payment history** from their platforms
4. **Employer data** (government has employee records)

### Emerging Markets:
1. **Mobile money records** (M-Pesa in Kenya)
2. **Payment history** (Mpesa, GCash transactions)
3. **Biometric verification** instead of documents

---

## For Your Class Demo

### Option 1: Keep It Simple (Current Approach)
```javascript
// Borrower self-reports (assume honest for demo)
RegisterBorrower(borrowerId, annualIncome, bankAccountBalance)
```
**Why?** Works for classroom, shows the concept

---

### Option 2: Mock External Verification
Add a verification layer that simulates calling external APIs:

```javascript
async RegisterBorrowerWithVerification(ctx, borrowerId, annualIncome, 
                                      bankAccountBalance, bankName) {
    // Simulate calling external bank
    const verified = this._mockVerifyExternalBank(
        borrowerId, 
        bankName,
        bankAccountBalance
    );
    
    if (!verified) {
        throw new Error("Bank verification failed!");
    }
    
    // Now register
    const profile = {
        borrowerId: borrowerId,
        annualIncome: annualIncome,
        bankAccountBalance: bankAccountBalance,
        verified: true,
        verifiedAt: new Date(),
        verificationSource: `EXTERNAL_${bankName}`,
        createdAt: Math.floor(Date.now() / 1000),
        paymentHistory: [],
        totalDebt: 0
    };
    
    await ctx.stub.putState(
        `borrower_${borrowerId}`,
        Buffer.from(JSON.stringify(profile))
    );
    
    return profile;
}

_mockVerifyExternalBank(borrowerId, bankName, claimedBalance) {
    // In demo: 90% success rate
    const verificationRate = 0.9;
    
    if (Math.random() > verificationRate) {
        console.log(`❌ Bank ${bankName} verification FAILED for ${borrowerId}`);
        return false;
    }
    
    console.log(`✅ Bank ${bankName} VERIFIED: $${claimedBalance}`);
    return true;
}
```

---

### Option 3: Implement Real Plaid Integration
If you want to be really impressive:
```bash
npm install plaid
```

Then verify real bank connections (requires OAuth token from user).

---

## Summary Table

| Method | Speed | Accuracy | Cost | Setup |
|--------|-------|----------|------|-------|
| **Direct Bank API** | Instant | 100% | High | Hard |
| **Plaid/Third Party** | Instant | 99% | $1-5/check | Easy |
| **Government Records** | Days | 100% | Free | Medium |
| **Employer Verification** | Instant | 95% | Low | Medium |
| **Blockchain** | Instant | 100% | Free | Impossible (now) |
| **Self-Report (Demo)** | Instant | 0% | Free | Trivial |

---

## Recommendation for Your Class

**Use Option 2: Mock External Verification**

It shows:
- ✅ You understand real banking requires verification
- ✅ Realistic error handling (verification can fail)
- ✅ Production-grade thinking (trust but verify)
- ✅ Maintains demo simplicity

Your professor will be impressed that you recognize **"real banks don't just trust borrowers"** 🎯
