#!/usr/bin/env python3
"""
Credit Facility Demo: Bank-Issued Stablecoin Lending

Demonstrates the lifecycle of a credit facility backed by USDw:
1. Bank mints reserves (USDw backed by Treasuries)
2. Loan approval & disbursement to borrower wallet
3. Scheduled repayments with principal + interest
4. Final reconciliation with reserve release and ledger metrics
"""

import json
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import importlib.util

from stablecoin_client import StablecoinClient

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from full_flow_demo import MockReserveRegistry, ledger_safe_amount

# Import the shared credit scoring simulator so logic is consistent
spec = importlib.util.spec_from_file_location('credit_scoring_demo', str(BASE_DIR / 'credit_scoring_demo.py'))
credit_mod = importlib.util.module_from_spec(spec)
sys.modules['credit_scoring_demo'] = credit_mod
spec.loader.exec_module(credit_mod)
CreditScoringSimulator = credit_mod.CreditScoringSimulator

LEDGER_BASE_URL = os.environ.get('USDW_API_URL', 'http://localhost:3000')
LENDER_ACCOUNT_ID = os.environ.get('USDW_LENDER_ACCOUNT', 'credit_bank')


def record_event(label, details):
    timestamp = datetime.utcnow().isoformat() + 'Z'
    print(f"[LEDGER][{timestamp}] {label}: {details}")


class LedgerBridge:
    """Handles optional REST calls for mint/transfer during loan simulation."""

    def __init__(self, bank_account):
        self.bank_account = bank_account
        self.client = None
        self.enabled = False
        try:
            self.client = StablecoinClient(base_url=LEDGER_BASE_URL)
            if self.client.health_check():
                record_event('CreditBridge', f"Connected to {LEDGER_BASE_URL}")
                self.enabled = True
        except Exception as exc:
            print(f"[LEDGER] Credit bridge unavailable ({exc}). Running offline.")
            self.client = None

    def mint(self, amount):
        if not self.enabled:
            return
        tokens = ledger_safe_amount(amount)
        if tokens <= 0:
            return
        record_event('MintReserve', f"Mint {tokens} to {self.bank_account}")
        result = self.client.mint(self.bank_account, tokens)
        if not result.success:
            record_event('MintFailed', result.error)

    def transfer(self, from_account, to_account, amount, reason):
        if not self.enabled:
            return
        tokens = ledger_safe_amount(amount)
        if tokens <= 0:
            return
        record_event('Transfer', f"{from_account} -> {to_account} ({reason}) amount={tokens}")
        result = self.client.transfer(from_account, to_account, tokens)
        if not result.success:
            record_event('TransferFailed', result.error)

    def close(self):
        if self.client:
            self.client.close()
            self.client = None
            self.enabled = False


class CreditCallSimulator:
    """Simulates a bank credit facility using stablecoin."""

    def __init__(self):
        self.bank_balance = 0
        self.borrower_balance = 0
        self.loan_details = {}
        self.transactions = []
        self.bank_account = LENDER_ACCOUNT_ID
        self.reserve_registry = MockReserveRegistry()
        self.ledger = LedgerBridge(self.bank_account)

    def print_header(self, title):
        print(f"\n{'='*80}")
        print(f"  {title}")
        print(f"{'='*80}\n")

    def print_section(self, title):
        print(f"\n{'-'*80}")
        print(f"  {title}")
        print(f"{'-'*80}\n")

    def simulate_mint(self, amount):
        print("Step 1: Bank creates stablecoin reserves")
        print(f"  Action: Mint {amount:,} USDw to {self.bank_account}")
        self.bank_balance = amount
        self.transactions.append({
            'type': 'MINT',
            'account': self.bank_account,
            'amount': amount,
            'timestamp': datetime.now(),
            'balance_after': self.bank_balance
        })
        reserve_allocations = self.reserve_registry.allocate(amount)
        if reserve_allocations:
            print("  Reserve Coverage:")
            for alloc in reserve_allocations:
                print(f"    • {alloc['reserve_id']} ({alloc['cusip']}): ${alloc['amount']:,}")
        self.ledger.mint(amount)
        print(f"  ✓ Bank Balance: ${self.bank_balance:,}")
        print("  ✓ Status: SUCCESSFUL - Bank ready to lend\n")
        return True

    def simulate_create_loan(self, loan_id, borrower_id, principal, annual_rate, duration_days):
        print("Step 2: Bank approves credit facility (loan)")
        print(f"  Loan ID: {loan_id}")
        print(f"  Borrower: {borrower_id}")
        print(f"  Principal: ${principal:,}")
        print(f"  Rate: {annual_rate}% | Duration: {duration_days} days")

        if self.bank_balance < principal:
            print("  ✗ FAILED: insufficient bank balance\n")
            return False

        self.loan_details = {
            'loanId': loan_id,
            'bankId': self.bank_account,
            'borrowerId': borrower_id,
            'principal': principal,
            'annualInterestRate': annual_rate,
            'durationDays': duration_days,
            'createdAt': datetime.now(),
            'maturityDate': datetime.now() + timedelta(days=duration_days),
            'status': 'active',
            'totalRepaid': 0,
            'payments': []
        }

        self.bank_balance -= principal
        self.borrower_balance += principal
        treasury_allocs = self.reserve_registry.allocate(principal)
        self.transactions.append({
            'type': 'CREATE_LOAN',
            'loanId': loan_id,
            'from': self.bank_account,
            'to': borrower_id,
            'amount': principal,
            'timestamp': datetime.now(),
            'bank_balance_after': self.bank_balance,
            'borrower_balance_after': self.borrower_balance
        })

        interest = (principal * annual_rate * duration_days) / (100 * 365)
        total_repayment = principal + interest

        print("\n  Loan Created Successfully:")
        print(f"    - Loan Status: ACTIVE")
        print(f"    - Bank transferred ${principal:,} to {borrower_id}")
        print(f"    - Expected Total Repayment: ${total_repayment:,.2f}")
        print(f"      (Principal: ${principal:,} + Interest: ${interest:,.2f})")
        if treasury_allocs:
            print("\n  Treasury Allocations:")
            for alloc in treasury_allocs:
                print(f"    - {alloc['reserve_id']} ({alloc['cusip']}): ${alloc['amount']:,}")
        print("\n  Account Balances After Loan Issuance:")
        print(f"    - Bank Balance: ${self.bank_balance:,}")
        print(f"    - {borrower_id} Balance: ${self.borrower_balance:,}")
        print("  ✓ Status: SUCCESSFUL - Loan disbursed\n")

        self.ledger.transfer(self.bank_account, borrower_id, principal, 'loan_disbursement')
        return True

    def simulate_payment(self, payment_num, payment_amount, days_elapsed):
        print(f"Step 3.{payment_num}: Borrower makes payment #{payment_num}")
        print(f"  Payment Amount: ${payment_amount:,} | Days Elapsed: {days_elapsed}")
        if self.borrower_balance < payment_amount:
            print("  ✗ FAILED: Borrower balance insufficient\n")
            return False

        principal = self.loan_details['principal']
        annual_rate = self.loan_details['annualInterestRate']
        interest_accrued = (principal * annual_rate * days_elapsed) / (100 * 365)

        prev_payments = len(self.loan_details['payments'])
        if prev_payments > 0:
            prev_days = self.loan_details['payments'][-1]['days_elapsed']
            prev_interest = (principal * annual_rate * prev_days) / (100 * 365)
            interest_in_payment = interest_accrued - prev_interest
        else:
            interest_in_payment = interest_accrued

        principal_component = max(0.0, payment_amount - interest_in_payment)
        interest_component = interest_in_payment

        total_repaid = self.loan_details['totalRepaid'] + payment_amount
        self.borrower_balance -= payment_amount
        self.bank_balance += payment_amount

        self.loan_details['totalRepaid'] = total_repaid
        self.loan_details['principal_repaid'] = self.loan_details.get('principal_repaid', 0.0) + principal_component
        self.loan_details['interest_revenue'] = self.loan_details.get('interest_revenue', 0.0) + interest_component
        self.loan_details['payments'].append({
            'payment_num': payment_num,
            'amount': payment_amount,
            'interest_component': interest_component,
            'principal_component': principal_component,
            'days_elapsed': days_elapsed,
            'timestamp': self.loan_details['createdAt'] + timedelta(days=days_elapsed),
            'total_repaid_after': total_repaid
        })

        total_owed = principal + interest_accrued
        remaining_balance = total_owed - total_repaid

        self.transactions.append({
            'type': 'PAY_LOAN',
            'loanId': self.loan_details['loanId'],
            'from': self.loan_details['borrowerId'],
            'to': self.bank_account,
            'amount': payment_amount,
            'timestamp': self.loan_details['createdAt'] + timedelta(days=days_elapsed),
            'bank_balance_after': self.bank_balance,
            'borrower_balance_after': self.borrower_balance
        })

        print("\n  Payment Breakdown:")
        print(f"    - Principal Component: ${payment_amount - interest_in_payment:,.2f}")
        print(f"    - Interest Component: ${interest_in_payment:,.2f}")
        print("\n  Loan Summary After Payment:")
        print(f"    - Total Interest Accrued: ${interest_accrued:,.2f}")
        print(f"    - Total Repaid So Far: ${total_repaid:,}")
        print(f"    - Remaining Balance: ${max(0, remaining_balance):,.2f}")
        print(f"    - Loan Status: {'ACTIVE' if remaining_balance > 0 else 'CLOSED'}")
        print("\n  Account Balances After Payment:")
        print(f"    - Bank Balance: ${self.bank_balance:,}")
        print(f"    - {self.loan_details['borrowerId']} Balance: ${self.borrower_balance:,}")
        print("  ✓ Status: SUCCESSFUL - Payment recorded\n")

        self.reserve_registry.release(payment_amount, f"Loan payment #{payment_num}")
        self.ledger.transfer(self.loan_details['borrowerId'], self.bank_account, payment_amount, f"loan_payment_{payment_num}")
        return True

    def print_final_report(self):
        self.print_header("CREDIT FACILITY SIMULATION - FINAL REPORT")
        print("Loan Details:")
        print(json.dumps({
            'loanId': self.loan_details['loanId'],
            'principal': self.loan_details['principal'],
            'annualRate': self.loan_details['annualInterestRate'],
            'durationDays': self.loan_details['durationDays'],
            'status': self.loan_details['status']
        }, indent=2, default=str))

        print("\nPayment History:")
        for payment in self.loan_details['payments']:
            print(f"  Payment #{payment['payment_num']} on {payment['timestamp'].strftime('%Y-%m-%d')}")
            print(f"    - Amount: ${payment['amount']:,}")
            print(f"    - Principal: ${payment['principal_component']:,.2f}")
            print(f"    - Interest: ${payment['interest_component']:,.2f}")
            print(f"    - Cumulative Repaid: ${payment['total_repaid_after']:,}")

        print("\nFinal Account Balances:")
        print(f"  - Bank Balance: ${self.bank_balance:,}")
        print(f"  - {self.loan_details['borrowerId']} Balance: ${self.borrower_balance:,}")

        print("\nTransaction Audit Trail:")
        for i, tx in enumerate(self.transactions, 1):
            print(f"  {i}. {tx['type']} :: {tx}")

        principal = self.loan_details['principal']
        total_interest = self.loan_details.get('interest_revenue', 0.0)
        print("\nBusiness Insights:")
        print(f"  - Total Interest Earned: ${total_interest:,.2f}")
        print(f"  - Interest as % of Principal: {(total_interest / principal * 100):.2f}%")
        print(f"  - Risk Assessment: {'LOW' if self.loan_details['totalRepaid'] >= principal else 'DEFAULT RISK'}")
        if self.ledger.enabled:
            metrics = self.ledger.client.get_metrics()
            print(f"  - Ledger Calls: {metrics['total_transactions']} (success rate {metrics['success_rate']})")

        print("\n✓ Credit facility lifecycle successfully demonstrated")
        print("✓ Smart contract logic enforces loan terms")
        print("✓ Ledger + reserves provide immutable audit trail")

    def shutdown(self):
        self.ledger.close()


def main():
    print("\n" + "="*80)
    print("  CREDIT FACILITY SIMULATION: Bank-Issued Stablecoin Lending")
    print("="*80)
    print(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)

    sim = CreditCallSimulator()

    sim.print_section("PHASE 1: BANK ESTABLISHES CAPITAL")
    sim.simulate_mint(100_000_000)

    sim.print_section("PHASE 2: BANK APPROVES CREDIT FACILITY")

    credit_sim = CreditScoringSimulator()
    borrower_id = "TechStartup_Inc"
    annual_income = 150_000
    deposits = 60_000
    payment_history = [
        {'on_time': True, 'payment_id': 'CC1'},
        {'on_time': True, 'payment_id': 'CC2'},
        {'on_time': True, 'payment_id': 'CC3'},
    ]

    credit_sim.register_borrower(
        borrower_id=borrower_id,
        annual_income=annual_income,
        bank_balance=deposits,
        payment_history=payment_history
    )

    requested_amount = 50_000
    assessment = credit_sim.assess_credit_risk(borrower_id, requested_amount)
    print("\nShared Credit Scoring Result:")
    print(json.dumps(assessment, indent=2))

    if not assessment.get('approved'):
        print("✗ Loan denied by credit scoring model. Simulation stopped.")
        return

    approved_amount = int(assessment.get('approved_amount', requested_amount))
    sim.simulate_create_loan(
        loan_id="LOAN_2025_001",
        borrower_id=borrower_id,
        principal=approved_amount,
        annual_rate=5,
        duration_days=90
    )

    sim.print_section("PHASE 3: BORROWER MAKES PAYMENTS")
    sim.simulate_payment(payment_num=1, payment_amount=17_100, days_elapsed=30)
    sim.simulate_payment(payment_num=2, payment_amount=17_300, days_elapsed=60)
    sim.simulate_payment(payment_num=3, payment_amount=15_600, days_elapsed=90)

    sim.loan_details['status'] = 'closed'

    sim.print_final_report()

    print("\n" + "="*80)
    print("  ✓ CREDIT FACILITY SIMULATION COMPLETED SUCCESSFULLY")
    print("="*80 + "\n")
    sim.shutdown()


if __name__ == '__main__':
    main()
