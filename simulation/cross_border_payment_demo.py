#!/usr/bin/env python3
"""
Cross-border Payment Simulation

Demonstrates remittance using traditional channels vs our USDw wallet path.
Outputs simple cost/time comparison and a wallet transfer simulation using local logic.
"""
import time
from datetime import datetime


def traditional_remittance(amount):
    # Simulate fees and delays in traditional remittance
    fee_percent = 0.03  # 3% typical
    fixed_fee = 5.0     # fixed service cost
    transfer_time_days = 2
    fee = amount * fee_percent + fixed_fee
    received = amount - fee
    return {
        'sent': amount,
        'fee': round(fee, 2),
        'received': round(received, 2),
        'time_days': transfer_time_days,
        'method': 'Traditional (WesternUnion/Bank)'
    }


def wallet_remittance(amount):
    # Simulate our wallet path with near-zero fees and instant delivery
    fee_percent = 0.0001  # 0.01% as example
    fixed_fee = 0.01      # tiny fixed fee
    transfer_time_minutes = 1
    fee = amount * fee_percent + fixed_fee
    received = amount - fee
    return {
        'sent': amount,
        'fee': round(fee, 2),
        'received': round(received, 2),
        'time_minutes': transfer_time_minutes,
        'method': 'USDw Wallet (instant, low-cost)'
    }


def simulate_wallet_transfer(sender, recipient_phone, amount):
    # Very small simulation of on-chain wallet transfer and mobile-money bridge
    tx_id = f"tx-{int(time.time())}"
    timestamp = datetime.utcnow().isoformat() + 'Z'
    # For demo, we don't actually alter ledger; just print structured result
    return {
        'tx_id': tx_id,
        'timestamp': timestamp,
        'from': sender,
        'to': recipient_phone,
        'amount': amount,
        'status': 'completed',
        'note': 'Simulated USDw wallet transfer; instant settlement in receiver wallet'
    }


def main():
    print("\n=== CROSS-BORDER PAYMENT SIMULATION ===\n")
    amount = 100.0  # USD
    print(f"Simulating a remittance of ${amount}\n")

    trad = traditional_remittance(amount)
    wallet = wallet_remittance(amount)

    print("-- Traditional Channel --")
    print(f"Method: {trad['method']}")
    print(f"Sent: ${trad['sent']}")
    print(f"Fee: ${trad['fee']}")
    print(f"Received: ${trad['received']}")
    print(f"Time: {trad['time_days']} days\n")

    print("-- USDw Wallet Channel --")
    print(f"Method: {wallet['method']}")
    print(f"Sent: ${wallet['sent']}")
    print(f"Fee: ${wallet['fee']}")
    print(f"Received: ${wallet['received']}")
    print(f"Time: {wallet['time_minutes']} minutes\n")

    # Simulate wallet transfer details
    sender = 'alice_us'
    recipient_phone = '+639171234567'  # Philippines example
    print("-- Simulated Wallet Transfer Record --")
    tx = simulate_wallet_transfer(sender, recipient_phone, amount)
    for k,v in tx.items():
        print(f"{k}: {v}")

    print("\nKey takeaway: Wallet path saves money and time, enabling faster, cheaper remittances for unbanked recipients.")

if __name__ == '__main__':
    main()
