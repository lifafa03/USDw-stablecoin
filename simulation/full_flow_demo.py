#!/usr/bin/env python3
"""
Full Flow Demo: Connect credit scoring, wallet, and cross-border remittance.

This orchestrator uses the existing simulation modules:
- simulation/credit_scoring_demo.py (CreditScoringSimulator)
- simulation/cross_border_payment_demo.py (remittance helpers)

Flow:
1. Register borrower (sender) and recipient
2. Calculate credit score and assess loan for sender
3. If approved, disburse loan by crediting sender's wallet balance
4. Use wallet to send a remittance to recipient phone (cross-border)
5. Compare wallet remittance vs traditional remittance costs/time

Run from project root:
python3 simulation/full_flow_demo.py
"""
import json
import os
from datetime import datetime, timedelta
from typing import Optional

# Import existing simulators using file-based import (works when running as a script)
import importlib.util
import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent
if str(base_dir) not in sys.path:
    sys.path.append(str(base_dir))
data_dir = base_dir / 'data'
data_dir.mkdir(exist_ok=True)

# credit_scoring_demo
spec = importlib.util.spec_from_file_location('credit_scoring_demo', str(base_dir / 'credit_scoring_demo.py'))
credit_mod = importlib.util.module_from_spec(spec)
sys.modules['credit_scoring_demo'] = credit_mod
spec.loader.exec_module(credit_mod)
CreditScoringSimulator = credit_mod.CreditScoringSimulator

# cross_border_payment_demo
spec2 = importlib.util.spec_from_file_location('cross_border_payment_demo', str(base_dir / 'cross_border_payment_demo.py'))
cross_mod = importlib.util.module_from_spec(spec2)
sys.modules['cross_border_payment_demo'] = cross_mod
spec2.loader.exec_module(cross_mod)
traditional_remittance = cross_mod.traditional_remittance
wallet_remittance = cross_mod.wallet_remittance
simulate_wallet_transfer = cross_mod.simulate_wallet_transfer

from stablecoin_client import StablecoinClient

LEDGER_BASE_URL = os.environ.get('USDW_API_URL', 'http://localhost:3000')
CENTRAL_BANK_ACCOUNT = os.environ.get('USDW_CENTRAL_BANK', 'bank_central')
REMITTANCE_BRIDGE_ACCOUNT = os.environ.get('USDW_REMITTANCE_BRIDGE', 'remit_bridge_ph')
CENTRAL_BANK_BUFFER = int(os.environ.get('USDW_CENTRAL_BANK_BUFFER', '2000'))
KYC_REGISTRY_PATH = data_dir / 'kyc_registry.json'


def format_money(x):
    return f"${x:,.2f}"


class KYCRegistry:
    """Simple in-memory KYC registry for demo purposes."""

    def __init__(self, path, initial_records=None):
        self.path = path
        self.records = self._load(initial_records)

    def _load(self, initial_records):
        if self.path.exists():
            with open(self.path, 'r', encoding='utf-8') as f:
                return json.load(f)
        records = initial_records or {
            'alice_us': {
                'status': 'approved',
                'tier': 'FULL',
                'verified_on': '2025-11-01T10:00:00Z'
            },
            'bob_business': {
                'status': 'pending',
                'tier': 'LIMITED',
                'verified_on': None
            }
        }
        self._persist(records)
        return records

    def _persist(self, records):
        with open(self.path, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2)

    def save(self):
        self._persist(self.records)

    def is_verified(self, account_id):
        record = self.records.get(account_id)
        return record and record['status'] == 'approved'

    def describe(self, account_id):
        record = self.records.get(account_id)
        if not record:
            return f"{account_id} not found in KYC registry"
        return f"status={record['status']} tier={record['tier']} verified_on={record['verified_on']}"


class ReserveFinancingManager:
    """Simulates how we finance Treasury purchases (deposits, equity, credit line)."""

    def __init__(
        self,
        deposit_pool: float = 2_000_000,
        equity_pool: float = 1_000_000,
        credit_limit: float = 5_000_000,
        credit_rate: float = 0.06
    ):
        self.deposit_pool = deposit_pool
        self.equity_pool = equity_pool
        self.initial_deposits = deposit_pool
        self.initial_equity = equity_pool
        self.credit_limit = credit_limit
        self.credit_rate = credit_rate
        self.credit_drawn = 0.0
        self.cost_ledger = []

    def describe(self):
        return {
            'deposit_pool': self.deposit_pool,
            'equity_pool': self.equity_pool,
            'credit_available': max(0, self.credit_limit - self.credit_drawn),
            'credit_drawn': self.credit_drawn
        }

    def _record_cost(self, amount, source):
        self.cost_ledger.append({
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'amount': amount,
            'source': source,
            'credit_rate': self.credit_rate if source == 'credit_line' else 0.0
        })

    def acquire_treasury(self, required_amount: float):
        """Determine how we finance a new Treasury purchase."""
        remaining = required_amount
        financing_plan = []

        if self.deposit_pool > 0 and remaining > 0:
            use = min(self.deposit_pool, remaining)
            self.deposit_pool -= use
            remaining -= use
            financing_plan.append({'source': 'deposits', 'amount': use})
            self._record_cost(use, 'deposits')

        if self.equity_pool > 0 and remaining > 0:
            use = min(self.equity_pool, remaining)
            self.equity_pool -= use
            remaining -= use
            financing_plan.append({'source': 'equity', 'amount': use})
            self._record_cost(use, 'equity')

        if remaining > 0:
            available_credit = self.credit_limit - self.credit_drawn
            use = min(available_credit, remaining)
            self.credit_drawn += use
            remaining -= use
            financing_plan.append({'source': 'credit_line', 'amount': use})
            self._record_cost(use, 'credit_line')

        if remaining > 0:
            print(f"[FINANCE] Warning: Unable to finance ${remaining:,.0f} of Treasury purchase.")
        else:
            plan_desc = ", ".join(f"{p['source']} ${p['amount']:,}" for p in financing_plan if p['amount'] > 0)
            print(f"[FINANCE] Treasury funded via: {plan_desc}")
        return financing_plan

    def release_cash(self, amount):
        """Repay credit line first, then replenish equity, then deposits."""
        remaining = amount
        if self.credit_drawn > 0:
            repay = min(self.credit_drawn, remaining)
            self.credit_drawn -= repay
            remaining -= repay
            print(f"[FINANCE] Repaid ${repay:,.2f} to credit line. Remaining credit drawn: ${self.credit_drawn:,.2f}")

        self.deposit_pool += remaining
        print(f"[FINANCE] Added ${remaining:,.2f} back to deposit pool (now ${self.deposit_pool:,.2f}).")


class MockReserveRegistry:
    """Tracks pretend Treasury holdings so every token is backed 1:1."""

    def __init__(self, financing_manager: Optional[ReserveFinancingManager] = None):
        self.holdings = [
            {
                'id': 'UST-001',
                'cusip': '91282CGW5',
                'maturity': '2034-11-15',
                'face_value': 1_000_000,
                'available': 1_000_000,
                'description': '10Y Treasury Note (Nov 2034)'
            },
            {
                'id': 'UST-002',
                'cusip': '912810TM0',
                'maturity': '2027-02-28',
                'face_value': 500_000,
                'available': 500_000,
                'description': '2Y Treasury Note (Feb 2027)'
            },
            {
                'id': 'UST-003',
                'cusip': '912796ZP5',
                'maturity': '2025-06-06',
                'face_value': 250_000,
                'available': 250_000,
                'description': '13-week Treasury Bill'
            }
        ]
        self.allocations = []
        self.auto_issue_counter = 0
        self.financing = financing_manager or ReserveFinancingManager()

    def total_available(self):
        return sum(h['available'] for h in self.holdings)

    def total_face_value(self):
        return sum(h['face_value'] for h in self.holdings)

    def allocate(self, amount_tokens):
        """Reserve lock Treasury value for a new mint/transfer."""
        needed = ledger_safe_amount(amount_tokens)
        if needed == 0:
            return []
        remaining = needed
        staged = []
        for holding in self.holdings:
            if remaining == 0:
                break
            available = holding['available']
            if available <= 0:
                continue
            take = min(available, remaining)
            staged.append((holding, take))
            remaining -= take
        if remaining > 0:
            # automatically "buy" a new Treasury lot to cover remaining demand
            self.auto_issue_counter += 1
            new_face = max(remaining * 2, 100_000)  # keep buffer
            self.financing.acquire_treasury(new_face)
            new_lot = {
                'id': f'UST-AUTO-{self.auto_issue_counter:03d}',
                'cusip': f'AUTO{self.auto_issue_counter:03d}',
                'maturity': (datetime.utcnow() + timedelta(days=365)).strftime('%Y-%m-%d'),
                'face_value': new_face,
                'available': new_face,
                'description': 'Auto-acquired Treasury lot'
            }
            self.holdings.append(new_lot)
            print(f"[RESERVE] Auto-issued new Treasury lot {new_lot['id']} for {format_money(new_face)} to meet demand.")
            staged.append((new_lot, remaining))
            remaining = 0
        allocations = []
        for holding, take in staged:
            holding['available'] -= take
            allocation = {
                'reserve_id': holding['id'],
                'cusip': holding['cusip'],
                'amount': take,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
            allocations.append(allocation)
            self.allocations.append(allocation)
        return allocations

    def release(self, amount_tokens, reason):
        to_release = ledger_safe_amount(amount_tokens)
        if to_release <= 0:
            return []
        remaining = to_release
        released = []
        # release from most recently used holdings first
        for holding in reversed(self.holdings):
            used = holding['face_value'] - holding['available']
            if used <= 0:
                continue
            give_back = min(used, remaining)
            holding['available'] += give_back
            released.append({
                'reserve_id': holding['id'],
                'cusip': holding['cusip'],
                'amount': give_back,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'reason': reason
            })
            remaining -= give_back
            if remaining == 0:
                break
        if remaining > 0:
            print(f"[RESERVE] Warning: attempted to release {format_money(to_release)} but only {format_money(to_release - remaining)} was tracked.")
        else:
            print(f"[RESERVE] Released {format_money(to_release)} to support redemption '{reason}'.")
            self.financing.release_cash(to_release)
        return released

    def report_lines(self):
        lines = ["Reserve Coverage Snapshot:"]
        for holding in self.holdings:
            used = holding['face_value'] - holding['available']
            lines.append(
                f"  - {holding['id']} ({holding['cusip']}): used {format_money(used)} / {format_money(holding['face_value'])}"
            )
        lines.append(f"  Total remaining capacity: {format_money(self.total_available())}")
        return lines


financing_manager = ReserveFinancingManager()
reserve_registry = MockReserveRegistry(financing_manager)
kyc_registry = KYCRegistry(KYC_REGISTRY_PATH)


class RiskEngine:
    """Simple risk limits per tier/action."""

    LIMITS = {
        'FULL': {
            'loan_disbursement': 250_000,
            'topup': 100_000,
            'remittance': 10_000,
            'offramp': 25_000
        },
        'LIMITED': {
            'loan_disbursement': 5_000,
            'topup': 2_000,
            'remittance': 500,
            'offramp': 1_000
        }
    }

    def __init__(self, registry):
        self.registry = registry

    def _tier(self, account_id):
        record = self.registry.records.get(account_id) or {}
        return record.get('tier', 'LIMITED')

    def check_limit(self, account_id, amount, action):
        tier = self._tier(account_id)
        limits = self.LIMITS.get(tier, self.LIMITS['LIMITED'])
        limit_amount = limits.get(action)
        if limit_amount is None:
            return True
        if amount > limit_amount:
            print(f"[RISK] Action '{action}' blocked for {account_id}: {format_money(amount)} exceeds {format_money(limit_amount)} (tier={tier})")
            return False
        return True


risk_engine = RiskEngine(kyc_registry)


def ledger_safe_amount(amount):
    """Fabric chaincode expects integer tokens."""
    return max(0, int(round(amount)))


def enforce_limit(account_id, amount, action):
    if risk_engine.check_limit(account_id, ledger_safe_amount(amount), action):
        return True
    print(f"[RISK] {action} denied for {account_id}.")
    return False


class BaselCompliance:
    """Tracks simplified Basel III ratios (CET1, leverage, LCR)."""

    MIN_CET1_RATIO = 0.045
    MIN_LEVERAGE_RATIO = 0.03
    MIN_LCR = 1.0

    def __init__(self, financing_manager, reserve_registry):
        self.financing = financing_manager
        self.reserve_registry = reserve_registry
        self.rwa = 0.0
        self.expected_outflows = 0.0

    def cet1_capital(self):
        return self.financing.initial_equity

    def total_exposure(self):
        return max(1.0, self.reserve_registry.total_face_value())

    def hqla(self):
        return max(1.0, self.reserve_registry.total_available())

    def ratios(self, rwa_delta=0.0, outflow_delta=0.0):
        projected_rwa = max(0.0, self.rwa + rwa_delta)
        projected_outflows = max(0.0, self.expected_outflows + outflow_delta)
        capital = self.cet1_capital()
        cet1 = capital / (projected_rwa if projected_rwa > 0 else 1.0)
        leverage = capital / self.total_exposure()
        lcr = self.hqla() / (projected_outflows if projected_outflows > 0 else 1.0)
        return {'cet1': cet1, 'leverage': leverage, 'lcr': lcr}

    def _check_thresholds(self, ratios, action):
        ok = True
        if ratios['cet1'] < self.MIN_CET1_RATIO:
            print(f"[BASEL] Blocked {action}: CET1 ratio would drop to {ratios['cet1']*100:.2f}%")
            ok = False
        if ratios['leverage'] < self.MIN_LEVERAGE_RATIO:
            print(f"[BASEL] Blocked {action}: Leverage ratio would drop to {ratios['leverage']*100:.2f}%")
            ok = False
        if ratios['lcr'] < self.MIN_LCR:
            print(f"[BASEL] Blocked {action}: LCR would drop to {ratios['lcr']*100:.2f}%")
            ok = False
        return ok

    def can_extend_credit(self, amount):
        ratios = self.ratios(rwa_delta=amount, outflow_delta=amount)
        return self._check_thresholds(ratios, action='loan_disbursement')

    def can_accept_deposit(self, amount):
        ratios = self.ratios(outflow_delta=amount)
        return self._check_thresholds(ratios, action='deposit')

    def register_loan(self, amount):
        self.rwa += amount
        self.expected_outflows += amount

    def register_topup(self, amount):
        self.expected_outflows += amount

    def register_repayment(self, amount):
        self.rwa = max(0.0, self.rwa - amount)
        self.expected_outflows = max(0.0, self.expected_outflows - amount)

    def register_offramp(self, amount):
        self.expected_outflows = max(0.0, self.expected_outflows - amount)

    def summary_lines(self):
        ratios = self.ratios()
        return [
            f"Basel CET1 Ratio: {ratios['cet1']*100:.2f}% (min {self.MIN_CET1_RATIO*100:.1f}%)",
            f"Basel Leverage Ratio: {ratios['leverage']*100:.2f}% (min {self.MIN_LEVERAGE_RATIO*100:.1f}%)",
            f"LCR: {ratios['lcr']*100:.2f}% (min {self.MIN_LCR*100:.0f}%)",
            f"Credit Exposure (RWA): ${self.rwa:,.2f}, Expected 30-day Outflow: ${self.expected_outflows:,.2f}",
            f"Financing mix: deposits ${self.financing.deposit_pool:,.2f}, equity ${self.financing.initial_equity:,.2f}, credit drawn ${self.financing.credit_drawn:,.2f}"
        ]


basel_monitor = BaselCompliance(financing_manager, reserve_registry)


def allocate_reserve_support(amount, purpose):
    allocations = reserve_registry.allocate(amount)
    if allocations is None:
        print(f"[RESERVE] Insufficient Treasury capacity to cover {format_money(amount)} for {purpose}.")
        return None
    print(f"[RESERVE] Locked {format_money(sum(a['amount'] for a in allocations))} of Treasuries for {purpose}:")
    for alloc in allocations:
        print(f"         - {alloc['reserve_id']} ({alloc['cusip']}) -> {format_money(alloc['amount'])}")
    return allocations


def record_compliance_event(event, details):
    timestamp = datetime.utcnow().isoformat() + 'Z'
    print(f"[LEDGER][{timestamp}] {event}: {details}")


def init_ledger_client():
    try:
        client = StablecoinClient(base_url=LEDGER_BASE_URL)
        if client.health_check():
            record_compliance_event('Connection', f"Stablecoin API reachable at {LEDGER_BASE_URL}")
            return client
    except Exception as exc:
        print(f"[LEDGER] Unable to initialize client ({exc}). Continuing in offline mode.")
    print("[LEDGER] REST API unavailable; proceeding with simulated wallet only.")
    return None


def ensure_central_bank_liquidity(client, minimum_needed):
    required = ledger_safe_amount(minimum_needed)
    if required == 0:
        return
    balance_info = client.get_balance(CENTRAL_BANK_ACCOUNT)
    current_balance = ledger_safe_amount(balance_info.get('balance', 0)) if balance_info else 0
    if current_balance >= required:
        return
    mint_amount = required - current_balance + CENTRAL_BANK_BUFFER
    record_compliance_event('MintRequest', f"Minting {mint_amount} tokens to {CENTRAL_BANK_ACCOUNT} to fund flows")
    result = client.mint(CENTRAL_BANK_ACCOUNT, mint_amount)
    if result.success:
        record_compliance_event('MintSuccess', f"Central bank balance topped up by {mint_amount}")
    else:
        record_compliance_event('MintFailed', f"Could not mint funds: {result.error}")


def ledger_credit_wallet(client, target_account, amount, reason, reserve_allocations=None):
    ledger_amount = ledger_safe_amount(amount)
    if ledger_amount <= 0:
        return None
    allocations = reserve_allocations
    if allocations is None:
        allocations = allocate_reserve_support(ledger_amount, reason)
        if allocations is None:
            return None
    ensure_central_bank_liquidity(client, ledger_amount)
    record_compliance_event('LoanDisbursement', f"Transferring {ledger_amount} tokens to {target_account} ({reason})")
    tx = client.transfer(CENTRAL_BANK_ACCOUNT, target_account, ledger_amount)
    if tx.success:
        record_compliance_event('TransferSuccess', f"Ledger balances updated for {target_account}")
        tx.data = tx.data or {}
        tx.data['reserveAllocations'] = allocations
        return tx
    record_compliance_event('TransferFailed', f"Ledger update failed: {tx.error}")
    return None


def ledger_execute_remittance(client, sender, amount):
    ledger_amount = ledger_safe_amount(amount)
    if ledger_amount <= 0:
        return None
    record_compliance_event('Remittance', f"{sender} -> {REMITTANCE_BRIDGE_ACCOUNT} amount {ledger_amount}")
    tx = client.transfer(sender, REMITTANCE_BRIDGE_ACCOUNT, ledger_amount)
    if tx.success:
        record_compliance_event('RemittanceSettled', f"On-ledger transfer complete for {ledger_amount}")
        return tx
    record_compliance_event('RemittanceFailed', f"Ledger remittance failed: {tx.error}")
    return None


class OffRampService:
    """Simulated automated payout rail to external banks/exchanges."""

    def __init__(self, reserve_registry, kyc_registry):
        self.reserve_registry = reserve_registry
        self.kyc_registry = kyc_registry

    def process_redemption(self, ledger_client, account_id, amount, destination_bank):
        ledger_amount = ledger_safe_amount(amount)
        if ledger_amount <= 0:
            return {'status': 'skipped', 'reason': 'amount <= 0'}

        if not self.kyc_registry.is_verified(account_id):
            reason = f"KYC not approved for {account_id}"
            print(f"[OFF-RAMP] Rejected redemption: {reason} ({self.kyc_registry.describe(account_id)})")
            return {'status': 'rejected', 'reason': reason}

        print(f"\n[OFF-RAMP] Processing redemption of {format_money(ledger_amount)} for {account_id} to {destination_bank}")
        burn_result = None
        if ledger_client:
            record_compliance_event('RedemptionRequest', f"{account_id} burning {ledger_amount} for payout to {destination_bank}")
            burn_result = ledger_client.burn(account_id, ledger_amount)
            if burn_result.success:
                record_compliance_event('BurnSuccess', f"{ledger_amount} removed from {account_id}")
            else:
                record_compliance_event('BurnFailed', f"{burn_result.error}")

        release_records = self.reserve_registry.release(ledger_amount, f"Payout to {destination_bank}")
        payout = {
            'destination': destination_bank,
            'amount': ledger_amount,
            'fiat_instruction': f"Initiate ACH/Wire to {destination_bank}",
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'ledger_burn': burn_result.data if burn_result and burn_result.success else None,
            'reserve_release': release_records
        }
        print(f"[OFF-RAMP] Payout instruction created: {payout['fiat_instruction']}")
        return payout


def main():
    print('\n=== FULL FLOW DEMO: Wallet + Credit + Cross-Border Remittance ===\n')
    sim = CreditScoringSimulator()
    ledger_client = init_ledger_client()
    offramp_service = OffRampService(reserve_registry, kyc_registry)

    # 1) Create sender (borrower) and recipient
    sender = 'alice_us'
    recipient_phone = '+639171234567'  # Philippines

    sim.register_borrower(
        borrower_id=sender,
        annual_income=60_000,   # example gig worker / migrant
        bank_balance=2_000,
        payment_history=[
            {'on_time': True, 'payment_id': 'P1'},
            {'on_time': True, 'payment_id': 'P2'},
            {'on_time': True, 'payment_id': 'P3'},
        ]
    )

    print(f"[{datetime.utcnow().isoformat()}] Registered borrower: {sender}")

    # 2) Run credit assessment for a small loan request to fund remittance
    requested_amount = 500.0  # small top-up / loan for remittance
    assessment = sim.assess_credit_risk(sender, requested_amount)

    if not assessment.get('approved'):
        print('\nLoan request denied; cannot fund wallet via loan. Showing alternative: direct top-up.')
        loan_amount = 0
    else:
        loan_amount = assessment.get('approved_amount', 0)
        print('\nLoan assessment:')
        print(f"  Approved: {assessment['approved']}, Tier: {assessment.get('tier')}, Approved Amount: {format_money(loan_amount)}")

    # 3) Simulate wallet creation and fund the wallet
    wallet = {
        'walletId': f"wallet-{sender}-{int(datetime.utcnow().timestamp())}",
        'owner': sender,
        'phone': '+1-555-000-0000',
        'balances': {
            'usdw': 0.0
        },
        'transactions': []
    }

    # If loan issued, credit wallet
    if loan_amount > 0:
        if not basel_monitor.can_extend_credit(loan_amount):
            print("[BASEL] Loan issuance halted due to regulatory ratios.")
            return
        if not enforce_limit(wallet['owner'], loan_amount, 'loan_disbursement'):
            return
        wallet['balances']['usdw'] += loan_amount
        reserve_info = allocate_reserve_support(loan_amount, 'Borrower loan disbursement')
        wallet['transactions'].append({
            'type': 'loan_disburse',
            'amount': loan_amount,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'reserves': reserve_info
        })
        print(f"\nLoan disbursed to wallet {wallet['walletId']}: {format_money(loan_amount)}")
        basel_monitor.register_loan(loan_amount)
        if ledger_client:
            ledger_credit_wallet(ledger_client, wallet['owner'], loan_amount, 'Credit-approved disbursement', reserve_info)
    else:
        # Simulate sender tops up wallet from own savings
        topup = 100.0
        if not basel_monitor.can_accept_deposit(topup):
            print("[BASEL] Deposit blocked due to liquidity coverage.")
            return
        if not enforce_limit(wallet['owner'], topup, 'topup'):
            return
        wallet['balances']['usdw'] += topup
        reserve_info = allocate_reserve_support(topup, 'User on-ramp top-up')
        wallet['transactions'].append({
            'type': 'topup',
            'amount': topup,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'reserves': reserve_info
        })
        print(f"\nWallet {wallet['walletId']} funded by user top-up: {format_money(topup)}")
        basel_monitor.register_topup(topup)
        if ledger_client:
            ledger_credit_wallet(ledger_client, wallet['owner'], topup, 'User on-ramp top-up', reserve_info)

    print(f"Current wallet balance: {format_money(wallet['balances']['usdw'])}\n")

    # 4) Decide remittance amount to send to recipient
    remittance_amount = 100.0
    if wallet['balances']['usdw'] < remittance_amount:
        print('Insufficient wallet balance for remittance')
        return
    if not enforce_limit(wallet['owner'], remittance_amount, 'remittance'):
        return

    # 5) Compare traditional vs wallet remittance for the same amount
    trad = traditional_remittance(remittance_amount)
    w = wallet_remittance(remittance_amount)

    print('--- REMITTANCE COMPARISON ---')
    print(f"Traditional: Sent {format_money(trad['sent'])}, Fee {format_money(trad['fee'])}, Received {format_money(trad['received'])}, Time {trad['time_days']} days")
    print(f"USDw Wallet: Sent {format_money(w['sent'])}, Fee {format_money(w['fee'])}, Received {format_money(w['received'])}, Time {w['time_minutes']} minutes")

    # 6) Execute wallet transfer (simulate)
    transfer_record = simulate_wallet_transfer(wallet['owner'], recipient_phone, remittance_amount)
    wallet['balances']['usdw'] -= remittance_amount
    wallet['transactions'].append({'type': 'send', 'amount': remittance_amount, 'to': recipient_phone, 'tx_id': transfer_record['tx_id'], 'timestamp': transfer_record['timestamp']})
    ledger_tx = None
    if ledger_client:
        ledger_tx = ledger_execute_remittance(ledger_client, wallet['owner'], remittance_amount)
        if ledger_tx and ledger_tx.data:
            transfer_record['ledger'] = ledger_tx.data

    print('\n--- WALLET TRANSFER EXECUTED ---')
    for k, v in transfer_record.items():
        print(f"{k}: {v}")

    print(f"\nWallet new balance: {format_money(wallet['balances']['usdw'])}")

    # 7) Simulate customer off-ramping remaining USDw to an external bank
    offramp_amount = 50.0
    offramp_completed = False
    if wallet['balances']['usdw'] >= offramp_amount:
        if not enforce_limit(wallet['owner'], offramp_amount, 'offramp'):
            print("[OFF-RAMP] Redemption blocked by risk engine.")
            offramp_completed = False
        else:
            payout_record = offramp_service.process_redemption(
                ledger_client,
                wallet['owner'],
                offramp_amount,
                destination_bank='PartnerBank_PH'
            )
            wallet['balances']['usdw'] -= offramp_amount
            wallet['transactions'].append({
                'type': 'offramp',
                'amount': offramp_amount,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'payout': payout_record
            })
            print(f"[OFF-RAMP] Wallet balance after redemption: {format_money(wallet['balances']['usdw'])}")
            offramp_completed = True
            basel_monitor.register_offramp(offramp_amount)
    else:
        print("[OFF-RAMP] Not enough balance to demonstrate redemption flow.")

    # Outcome summary for slides
    print('\n=== SUMMARY FOR SLIDES ===')
    print(f"- Borrower {sender} used wallet {wallet['walletId']} to send {format_money(remittance_amount)} to {recipient_phone}.")
    print(f"- Wallet path saved {format_money(trad['fee'] - w['fee'])} compared to traditional channel and completed in minutes instead of days.")
    if offramp_completed:
        print(f"- Automated off-ramp processed {format_money(offramp_amount)} payout to PartnerBank_PH with reserve-backed redemption.")
    if ledger_client:
        metrics = ledger_client.get_metrics()
        print(f"- Ledger integration executed {metrics['total_transactions']} API calls with success rate {metrics['success_rate']}.")
        ledger_client.close()
    for line in reserve_registry.report_lines():
        print(f"- {line}")
    for line in basel_monitor.summary_lines():
        print(f"- {line}")
    print('\nFull flow complete. Use this output in your slides to show end-to-end connection: credit -> wallet -> remittance.')


if __name__ == '__main__':
    main()
