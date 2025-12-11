#!/usr/bin/env python3
"""
Massive USDw Bank Demo
----------------------

Simulates dozens of randomly generated customers going through the end-to-end
bank experience:
  * Onboarding with credit scoring
  * Wallet funding via loans or deposits
  * Random credit card purchases
  * Cross-border remittances vs. legacy rails
  * Optional off-ramps back to local banks

This script is designed for presentations where we need to show that the USDw
bank stack can scale beyond a single borrower.
"""

import random
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import importlib.util
import sys

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

# credit_scoring_demo
spec = importlib.util.spec_from_file_location('credit_scoring_demo', str(BASE_DIR / 'credit_scoring_demo.py'))
credit_mod = importlib.util.module_from_spec(spec)
sys.modules['credit_scoring_demo'] = credit_mod
spec.loader.exec_module(credit_mod)
CreditScoringSimulator = credit_mod.CreditScoringSimulator

# cross-border helpers
spec2 = importlib.util.spec_from_file_location('cross_border_payment_demo', str(BASE_DIR / 'cross_border_payment_demo.py'))
cross_mod = importlib.util.module_from_spec(spec2)
sys.modules['cross_border_payment_demo'] = cross_mod
spec2.loader.exec_module(cross_mod)
wallet_remittance = cross_mod.wallet_remittance
traditional_remittance = cross_mod.traditional_remittance
simulate_wallet_transfer = cross_mod.simulate_wallet_transfer


@dataclass
class ClientProfile:
    client_id: str
    annual_income: float
    bank_balance: float
    payment_history: list
    credit_assessment: dict = field(default_factory=dict)
    wallet_balance: float = 0.0
    credit_purchases: list = field(default_factory=list)
    remittances: list = field(default_factory=list)
    offramps: list = field(default_factory=list)


class MassiveBankDemo:
    def __init__(self, num_clients=25, seed=42):
        self.num_clients = num_clients
        self.random = random.Random(seed)
        self.credit_sim = CreditScoringSimulator()
        self.clients = []

    def _random_payment_history(self):
        entries = []
        for i in range(self.random.randint(3, 8)):
            entries.append({'on_time': self.random.random() > 0.1, 'payment_id': f'P{i}'})
        return entries

    def generate_clients(self):
        for i in range(self.num_clients):
            income = self.random.randint(25_000, 180_000)
            deposits = self.random.randint(500, 80_000)
            client = ClientProfile(
                client_id=f'user_{i:03d}',
                annual_income=income,
                bank_balance=deposits,
                payment_history=self._random_payment_history()
            )
            self.credit_sim.register_borrower(
                borrower_id=client.client_id,
                annual_income=client.annual_income,
                bank_balance=client.bank_balance,
                payment_history=client.payment_history
            )
            self.clients.append(client)

    def evaluate_credit(self):
        for client in self.clients:
            requested_amount = self.random.choice([0, 250, 500, 1000, 5000, 10000])
            if requested_amount == 0:
                continue
            assessment = self.credit_sim.assess_credit_risk(client.client_id, requested_amount)
            client.credit_assessment = assessment
            if assessment.get('approved'):
                approved_amount = assessment.get('approved_amount', 0)
                client.wallet_balance += approved_amount
            else:
                # fallback to self-funding
                fallback = min(client.bank_balance * 0.2, requested_amount)
                client.wallet_balance += fallback

    def simulate_credit_card_usage(self):
        categories = ['groceries', 'travel', 'electronics', 'education', 'utilities', 'entertainment']
        for client in self.clients:
            num_swipes = self.random.randint(1, 5)
            for _ in range(num_swipes):
                amount = round(self.random.uniform(10, 500), 2)
                category = self.random.choice(categories)
                timestamp = datetime.utcnow().isoformat() + 'Z'
                client.credit_purchases.append({
                    'amount': amount,
                    'category': category,
                    'timestamp': timestamp
                })
                client.wallet_balance = max(0.0, client.wallet_balance - amount * 0.05)  # assume 5% paid from wallet immediately

    def simulate_remittances(self):
        for client in self.clients:
            if client.wallet_balance < 50 or self.random.random() < 0.4:
                continue
            amount = min(client.wallet_balance * 0.3, self.random.uniform(50, 400))
            trad = traditional_remittance(amount)
            wallet = wallet_remittance(amount)
            tx_record = simulate_wallet_transfer(client.client_id, f'+63{self.random.randint(9000000000, 9999999999)}', amount)
            client.wallet_balance -= amount
            client.remittances.append({
                'amount': amount,
                'traditional': trad,
                'wallet': wallet,
                'tx_record': tx_record
            })

    def simulate_offramps(self):
        for client in self.clients:
            if client.wallet_balance < 25 or self.random.random() < 0.5:
                continue
            amount = round(client.wallet_balance * self.random.uniform(0.1, 0.3), 2)
            client.wallet_balance -= amount
            client.offramps.append({
                'amount': amount,
                'destination': self.random.choice(['PartnerBank_PH', 'PartnerBank_US', 'Fintech_NEOBANK']),
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            })

    def run(self):
        self.generate_clients()
        self.evaluate_credit()
        self.simulate_credit_card_usage()
        self.simulate_remittances()
        self.simulate_offramps()
        self.print_summary()

    def print_summary(self):
        approved = [c for c in self.clients if c.credit_assessment.get('approved')]
        rejected = [c for c in self.clients if c.credit_assessment and not c.credit_assessment.get('approved')]
        total_wallets = sum(c.wallet_balance for c in self.clients)
        total_remit = sum(rem['amount'] for c in self.clients for rem in c.remittances)
        total_offramp = sum(off['amount'] for c in self.clients for off in c.offramps)

        print("\n" + "="*88)
        print(" USDw MASSIVE BANK DEMO RESULTS ")
        print("="*88)
        print(f"Clients simulated: {len(self.clients)}")
        print(f"Loans approved: {len(approved)} | Loans denied: {len(rejected)}")
        print(f"Total wallet balances remaining: ${total_wallets:,.2f}")
        print(f"Total remittances sent: ${total_remit:,.2f} | Off-ramp payouts: ${total_offramp:,.2f}")
        print("\nTop 5 Client Snapshots:")
        sample = self.random.sample(self.clients, min(5, len(self.clients)))
        for client in sample:
            assessment = client.credit_assessment
            tier = assessment.get('tier') if assessment else 'N/A'
            approved_amt = assessment.get('approved_amount') if assessment else 0
            print(f"- {client.client_id}: income ${client.annual_income:,}, "
                  f"credit tier={tier}, approved=${approved_amt:,}, "
                  f"wallet_balance=${client.wallet_balance:,.2f}, "
                  f"purchases={len(client.credit_purchases)}, "
                  f"remittances={len(client.remittances)}, offramps={len(client.offramps)}")


if __name__ == '__main__':
    MassiveBankDemo(num_clients=40, seed=1337).run()
