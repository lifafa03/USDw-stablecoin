"""
Example: Mint GENUSD Stablecoins (Python)

Demonstrates minting new stablecoins using the Python SDK.
"""

from genusd_sdk import create_client, MintRequest, UTXO


def main():
    # Initialize SDK client
    client = create_client(
        api_url="http://localhost:3000/api/v1",
        api_key="your_api_key_here",
        enable_mock_signatures=True,  # Set to False in production
    )

    print("🪙 GENUSD Mint Example (Python)\n")

    # Define mint request
    mint_request = MintRequest(
        outputs=[
            UTXO(
                owner_id="user_alice",
                amount=1000000,  # $10,000 (6 decimals)
                asset_code="GENUSD",
                kyc_tag="KYC_LEVEL_3",
            ),
            UTXO(
                owner_id="user_bob",
                amount=500000,  # $5,000
                asset_code="GENUSD",
                kyc_tag="KYC_LEVEL_2",
            ),
        ],
        issuer_id="issuer_central_bank",
        dilithium_signature="",  # Will be auto-generated if mock enabled
    )

    print("📝 Mint Request:")
    print(f"  Issuer: {mint_request.issuer_id}")
    print(f"  Outputs: {len(mint_request.outputs)}")
    for i, output in enumerate(mint_request.outputs, 1):
        print(f"    {i}. {output.owner_id}: ${output.amount / 100:.2f}")
    print()

    # Execute mint transaction
    print("⏳ Submitting mint transaction...")
    result = client.mint(mint_request)

    if result.success:
        print("✅ Mint successful!")
        print(f"Transaction ID: {result.tx_id}")
        print(f"Created UTXOs: {', '.join(result.data.get('utxo_ids', []))}")
        print()

        # Query balance for Alice
        print("💰 Querying Alice's balance...")
        balance_result = client.get_balance("user_alice")

        if balance_result.success:
            balance = balance_result.data.get("balance", 0)
            utxos = balance_result.data.get("utxos", [])
            print(f"Alice's balance: ${balance / 100:.2f}")
            print(f"Active UTXOs: {len(utxos)}")
    else:
        print(f"❌ Mint failed: {result.error}")


if __name__ == "__main__":
    main()
