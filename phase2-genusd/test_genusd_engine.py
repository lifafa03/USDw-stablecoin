"""
GENUSD Engine Test Suite

Comprehensive tests for the UTXO transaction processing engine using test vectors.
Tests cover valid transactions, invalid transactions, edge cases, and compliance scenarios.

Run with: python3 test_genusd_engine.py
"""

import json
import unittest
import time
from genusd_engine import (
    GENUSDEngine,
    TransactionType,
    UTXOStatus,
    KYCLevel,
    generate_mock_signature,
    generate_attestation
)


class TestGENUSDEngine(unittest.TestCase):
    """Test suite for GENUSD UTXO engine"""

    def setUp(self):
        """Initialize engine before each test"""
        self.engine = GENUSDEngine()
        self.engine.set_verified_reserves(200_000_000)  # $2M reserves

        # Register test users
        self.engine.policy_engine.register_kyc(
            "x509::/C=US/ST=CA/O=Org1/CN=treasury",
            "KYC_LEVEL_3"
        )
        self.engine.policy_engine.register_kyc(
            "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
            "KYC_LEVEL_2"
        )
        self.engine.policy_engine.register_kyc(
            "x509::/C=GB/O=Org2/CN=uk_treasury",
            "KYC_LEVEL_3"
        )

    # ========================================================================
    # MINT TESTS
    # ========================================================================

    def test_mint_001_valid_single_output(self):
        """Test valid MINT with single output"""
        tx = {
            "type": "MINT",
            "tx_id": "MINT_20251128_001",
            "timestamp": int(time.time()),
            "inputs": [],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                "asset_code": "GENUSD",
                "amount": 100_000_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_3",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("reserve_proof_1")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "MINT_20251128_001")
            },
            "metadata": {
                "memo": "Initial mint $1,000,000",
                "reserve_proof": "BANK_STATEMENT_SHA256:test"
            }
        }

        success, msg, tx_id = self.engine.process_transaction(tx)
        self.assertTrue(success, msg)
        self.assertEqual(tx_id, "MINT_20251128_001")
        self.assertEqual(self.engine.get_total_supply(), 100_000_000)
        self.assertEqual(len(self.engine.utxos), 1)

    def test_mint_002_valid_multiple_outputs(self):
        """Test valid MINT with multiple outputs"""
        tx = {
            "type": "MINT",
            "tx_id": "MINT_20251128_002",
            "timestamp": int(time.time()),
            "inputs": [],
            "outputs": [
                {
                    "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                    "asset_code": "GENUSD",
                    "amount": 50_000_000,
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_3",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "US",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("reserve_1")
                    }
                },
                {
                    "owner_id": "x509::/C=GB/O=Org2/CN=uk_treasury",
                    "asset_code": "GENUSD",
                    "amount": 30_000_000,
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_3",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "GB",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("reserve_2")
                    }
                }
            ],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "MINT_20251128_002")
            },
            "metadata": {
                "memo": "Multi-jurisdiction mint",
                "reserve_proof": "BANK_STATEMENT_SHA256:multi"
            }
        }

        success, msg, tx_id = self.engine.process_transaction(tx)
        self.assertTrue(success, msg)
        self.assertEqual(self.engine.get_total_supply(), 80_000_000)
        self.assertEqual(len(self.engine.utxos), 2)

    def test_mint_invalid_001_missing_issuer_signature(self):
        """Test MINT rejection: missing issuer signature"""
        tx = {
            "type": "MINT",
            "tx_id": "MINT_INVALID_001",
            "timestamp": int(time.time()),
            "inputs": [],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                "asset_code": "GENUSD",
                "amount": 100_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_3",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {},  # Missing issuer signature
            "metadata": {"memo": "Invalid mint"}
        }

        success, msg, tx_id = self.engine.process_transaction(tx)
        self.assertFalse(success)
        self.assertIn("issuer signature", msg.lower())

    def test_mint_invalid_002_insufficient_reserves(self):
        """Test MINT rejection: insufficient reserves"""
        self.engine.set_verified_reserves(1_000_000)  # Only $10k reserves

        tx = {
            "type": "MINT",
            "tx_id": "MINT_INVALID_002",
            "timestamp": int(time.time()),
            "inputs": [],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                "asset_code": "GENUSD",
                "amount": 999_999_999_999,  # Trying to mint $10B
                "status": "active",
                "kyc_tag": "KYC_LEVEL_3",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "MINT_INVALID_002")
            },
            "metadata": {"memo": "Exceed reserves"}
        }

        success, msg, tx_id = self.engine.process_transaction(tx)
        self.assertFalse(success)
        self.assertIn("reserves", msg.lower())

    def test_mint_invalid_003_has_inputs(self):
        """Test MINT rejection: has inputs (should be empty)"""
        tx = {
            "type": "MINT",
            "tx_id": "MINT_INVALID_003",
            "timestamp": int(time.time()),
            "inputs": ["FAKE_UTXO:0"],  # MINT should have no inputs
            "outputs": [{
                "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                "asset_code": "GENUSD",
                "amount": 100_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_3",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "MINT_INVALID_003")
            },
            "metadata": {"memo": "Invalid"}
        }

        success, msg, tx_id = self.engine.process_transaction(tx)
        self.assertFalse(success)
        self.assertIn("empty inputs", msg.lower())

    # ========================================================================
    # TRANSFER TESTS
    # ========================================================================

    def test_transfer_001_valid_with_change(self):
        """Test valid TRANSFER with change UTXO"""
        # First mint some tokens
        self.test_mint_001_valid_single_output()

        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_20251128_042",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [
                {
                    "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
                    "asset_code": "GENUSD",
                    "amount": 50_000,
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_2",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "US",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("transfer")
                    }
                },
                {
                    "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                    "asset_code": "GENUSD",
                    "amount": 99_950_000,
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_3",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "US",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("change")
                    }
                }
            ],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "TRANSFER")
            },
            "metadata": {"memo": "Payment for invoice"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertTrue(success, msg)

        # Check balances
        merchant_balance = self.engine.get_balance("x509::/C=US/ST=NY/O=Org1/CN=merchant_abc")
        treasury_balance = self.engine.get_balance("x509::/C=US/ST=CA/O=Org1/CN=treasury")
        self.assertEqual(merchant_balance, 50_000)
        self.assertEqual(treasury_balance, 99_950_000)

        # Check input UTXO is spent
        input_utxo = self.engine.get_utxo("MINT_20251128_001:0")
        self.assertEqual(input_utxo.status, UTXOStatus.SPENT.value)

    def test_transfer_invalid_001_conservation_violation(self):
        """Test TRANSFER rejection: input sum != output sum"""
        # First mint
        self.test_mint_001_valid_single_output()

        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_INVALID_001",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [
                {
                    "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
                    "asset_code": "GENUSD",
                    "amount": 50_000,
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_2",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "US",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("test")
                    }
                },
                {
                    "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                    "asset_code": "GENUSD",
                    "amount": 60_000,  # Total = 110k, but input was 100M
                    "status": "active",
                    "kyc_tag": "KYC_LEVEL_3",
                    "created_at": int(time.time()),
                    "metadata": {
                        "jurisdiction": "US",
                        "blacklist_flag": False,
                        "freeze_reason": None,
                        "policy_version": "POLICY_V1.0",
                        "issuer_attestation": generate_attestation("test")
                    }
                }
            ],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "TRANSFER")
            },
            "metadata": {"memo": "Invalid"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertFalse(success)
        self.assertIn("!= output sum", msg.lower())

    def test_transfer_invalid_002_missing_signature(self):
        """Test TRANSFER rejection: missing sender signature"""
        self.test_mint_001_valid_single_output()

        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_INVALID_002",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
                "asset_code": "GENUSD",
                "amount": 100_000_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_2",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {},  # Missing signature
            "metadata": {"memo": "Theft attempt"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertFalse(success)
        self.assertIn("signature", msg.lower())

    def test_transfer_invalid_003_unregistered_recipient(self):
        """Test TRANSFER rejection: recipient has no KYC"""
        self.test_mint_001_valid_single_output()

        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_INVALID_003",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [{
                "owner_id": "x509::/C=XX/O=Unknown/CN=no_kyc_user",  # Not registered
                "asset_code": "GENUSD",
                "amount": 100_000_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_2",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "TX")
            },
            "metadata": {"memo": "To unregistered user"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertFalse(success)
        self.assertIn("kyc", msg.lower())

    # ========================================================================
    # BURN TESTS
    # ========================================================================

    def test_burn_001_valid_redemption(self):
        """Test valid BURN transaction"""
        # First mint
        self.test_mint_001_valid_single_output()

        burn_tx = {
            "type": "BURN",
            "tx_id": "BURN_20251128_099",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "BURN"),
                "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "BURN")
            },
            "metadata": {
                "memo": "Redemption for $1M",
                "redemption_proof": "WIRE_SHA256:test"
            }
        }

        success, msg, tx_id = self.engine.process_transaction(burn_tx)
        self.assertTrue(success, msg)
        self.assertEqual(self.engine.get_total_supply(), 0)

        # Check UTXO is spent
        utxo = self.engine.get_utxo("MINT_20251128_001:0")
        self.assertEqual(utxo.status, UTXOStatus.SPENT.value)

    def test_burn_invalid_001_has_outputs(self):
        """Test BURN rejection: has outputs (should be empty)"""
        self.test_mint_001_valid_single_output()

        burn_tx = {
            "type": "BURN",
            "tx_id": "BURN_INVALID_001",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [{  # BURN should have no outputs
                "owner_id": "x509::/C=US/ST=CA/O=Org1/CN=treasury",
                "asset_code": "GENUSD",
                "amount": 50_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_3",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "issuer": generate_mock_signature("issuer", "BURN")
            },
            "metadata": {"memo": "Invalid"}
        }

        success, msg, tx_id = self.engine.process_transaction(burn_tx)
        self.assertFalse(success)
        self.assertIn("empty outputs", msg.lower())

    # ========================================================================
    # ADMIN OPERATION TESTS
    # ========================================================================

    def test_freeze_unfreeze_utxo(self):
        """Test freeze and unfreeze UTXO workflow"""
        # First mint
        self.test_mint_001_valid_single_output()
        utxo_id = "MINT_20251128_001:0"

        # Freeze
        success, msg = self.engine.freeze_utxo(utxo_id, "AML investigation")
        self.assertTrue(success, msg)

        utxo = self.engine.get_utxo(utxo_id)
        self.assertEqual(utxo.status, UTXOStatus.FROZEN.value)
        self.assertEqual(utxo.metadata.freeze_reason, "AML investigation")

        # Try to spend frozen UTXO (should fail)
        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_FROZEN_TEST",
            "timestamp": int(time.time()),
            "inputs": [utxo_id],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
                "asset_code": "GENUSD",
                "amount": 100_000_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_2",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "TX")
            },
            "metadata": {"memo": "Try spend frozen"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertFalse(success)
        self.assertIn("not active", msg.lower())

        # Unfreeze
        success, msg = self.engine.unfreeze_utxo(utxo_id)
        self.assertTrue(success, msg)

        utxo = self.engine.get_utxo(utxo_id)
        self.assertEqual(utxo.status, UTXOStatus.ACTIVE.value)
        self.assertIsNone(utxo.metadata.freeze_reason)

    def test_blacklist_owner(self):
        """Test blacklist functionality"""
        # First mint
        self.test_mint_001_valid_single_output()

        # Blacklist the owner
        owner_id = "x509::/C=US/ST=CA/O=Org1/CN=treasury"
        self.engine.policy_engine.blacklist_owner(owner_id)

        # Try to transfer (should fail)
        transfer_tx = {
            "type": "TRANSFER",
            "tx_id": "TRANSFER_BLACKLIST_TEST",
            "timestamp": int(time.time()),
            "inputs": ["MINT_20251128_001:0"],
            "outputs": [{
                "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant_abc",
                "asset_code": "GENUSD",
                "amount": 100_000_000,
                "status": "active",
                "kyc_tag": "KYC_LEVEL_2",
                "created_at": int(time.time()),
                "metadata": {
                    "jurisdiction": "US",
                    "blacklist_flag": False,
                    "freeze_reason": None,
                    "policy_version": "POLICY_V1.0",
                    "issuer_attestation": generate_attestation("test")
                }
            }],
            "policy_ref": "POLICY_V1.0",
            "signatures": {
                owner_id: generate_mock_signature("treasury", "TX")
            },
            "metadata": {"memo": "Blacklisted transfer"}
        }

        success, msg, tx_id = self.engine.process_transaction(transfer_tx)
        self.assertFalse(success)
        self.assertIn("blacklist", msg.lower())


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    # Run all tests
    unittest.main(verbosity=2)
