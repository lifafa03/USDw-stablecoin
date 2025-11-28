"""
GENUSD UTXO Engine - Phase 2 Mock Implementation

This module implements the core UTXO-based transaction processing engine for GENUSD stablecoin.
Designed to be portable to Hyperledger Fabric chaincode in later phases.

Features:
- UTXO state management
- MINT, TRANSFER, BURN transaction processing
- KYC/AML compliance validation
- Policy enforcement
- Cryptographic signature verification (mock)
"""

import json
import hashlib
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum


# ============================================================================
# CONSTANTS & ENUMS
# ============================================================================

class TransactionType(Enum):
    """Supported transaction types"""
    MINT = "MINT"
    TRANSFER = "TRANSFER"
    BURN = "BURN"


class UTXOStatus(Enum):
    """UTXO lifecycle states"""
    ACTIVE = "active"
    FROZEN = "frozen"
    SPENT = "spent"


class KYCLevel(Enum):
    """KYC verification levels"""
    LEVEL_0 = "KYC_LEVEL_0"  # Not allowed
    LEVEL_1 = "KYC_LEVEL_1"  # $1,000/day limit
    LEVEL_2 = "KYC_LEVEL_2"  # $10,000/day limit
    LEVEL_3 = "KYC_LEVEL_3"  # Unlimited


# KYC daily transfer limits (in cents)
KYC_DAILY_LIMITS = {
    KYCLevel.LEVEL_0: 0,
    KYCLevel.LEVEL_1: 100_000,      # $1,000
    KYCLevel.LEVEL_2: 1_000_000,    # $10,000
    KYCLevel.LEVEL_3: 999_999_999_999  # Unlimited (10T)
}


ASSET_CODE = "GENUSD"
MAX_UTXO_AMOUNT = 999_999_999_999_999  # 10 trillion dollars max per UTXO


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class UTXOMetadata:
    """Compliance and policy metadata for UTXO"""
    jurisdiction: str
    blacklist_flag: bool
    freeze_reason: Optional[str]
    policy_version: str
    issuer_attestation: str


@dataclass
class UTXO:
    """Unspent Transaction Output"""
    utxo_id: str
    owner_id: str
    asset_code: str
    amount: int
    status: str
    kyc_tag: str
    created_at: int
    metadata: UTXOMetadata

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['metadata'] = asdict(self.metadata)
        return result

    @staticmethod
    def from_dict(data: dict) -> 'UTXO':
        """Create UTXO from dictionary"""
        metadata = UTXOMetadata(**data['metadata'])
        return UTXO(
            utxo_id=data['utxo_id'],
            owner_id=data['owner_id'],
            asset_code=data['asset_code'],
            amount=data['amount'],
            status=data['status'],
            kyc_tag=data['kyc_tag'],
            created_at=data['created_at'],
            metadata=metadata
        )


@dataclass
class Transaction:
    """Base transaction structure"""
    type: str
    tx_id: str
    timestamp: int
    inputs: List[str]
    outputs: List[dict]
    policy_ref: str
    signatures: Dict[str, str]
    metadata: dict

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)


# ============================================================================
# POLICY ENGINE
# ============================================================================

class PolicyEngine:
    """Policy and compliance rule enforcement"""

    def __init__(self):
        self.policies = {}
        self.blacklist = set()
        self.allowed_jurisdictions = {"US", "GB", "SG", "JP", "CH"}
        self.kyc_registry = {}  # owner_id -> KYC level
        self.daily_transfer_tracking = {}  # owner_id -> {date: amount}

        # Load default policy
        self._load_default_policy()

    def _load_default_policy(self):
        """Load POLICY_V1.0"""
        self.policies["POLICY_V1.0"] = {
            "version": "POLICY_V1.0",
            "issuer": "issuer",
            "min_burn_amount": 100_000,  # $1,000 minimum redemption
            "max_mint_per_tx": 10_000_000_000,  # $100M per transaction
            "allowed_jurisdictions": list(self.allowed_jurisdictions),
            "kyc_required": True
        }

    def register_kyc(self, owner_id: str, kyc_level: str):
        """Register user's KYC level"""
        self.kyc_registry[owner_id] = kyc_level

    def get_kyc_level(self, owner_id: str) -> Optional[str]:
        """Get user's KYC level"""
        return self.kyc_registry.get(owner_id)

    def blacklist_owner(self, owner_id: str):
        """Add owner to blacklist"""
        self.blacklist.add(owner_id)

    def is_blacklisted(self, owner_id: str) -> bool:
        """Check if owner is blacklisted"""
        return owner_id in self.blacklist

    def check_daily_limit(self, owner_id: str, amount: int) -> Tuple[bool, str]:
        """Check if transfer amount within daily limit"""
        kyc_level = self.get_kyc_level(owner_id)
        if not kyc_level:
            return False, f"Owner {owner_id} has no KYC registration"

        kyc_enum = KYCLevel(kyc_level)
        daily_limit = KYC_DAILY_LIMITS[kyc_enum]

        # Get today's date
        today = time.strftime("%Y-%m-%d", time.gmtime())

        # Initialize tracking if needed
        if owner_id not in self.daily_transfer_tracking:
            self.daily_transfer_tracking[owner_id] = {}

        # Get today's transferred amount
        today_amount = self.daily_transfer_tracking[owner_id].get(today, 0)

        # Check limit
        if today_amount + amount > daily_limit:
            remaining = daily_limit - today_amount
            return False, f"Daily limit exceeded. Limit: ${daily_limit/100:.2f}, Used: ${today_amount/100:.2f}, Remaining: ${remaining/100:.2f}"

        return True, ""

    def record_transfer(self, owner_id: str, amount: int):
        """Record transfer for daily limit tracking"""
        today = time.strftime("%Y-%m-%d", time.gmtime())
        if owner_id not in self.daily_transfer_tracking:
            self.daily_transfer_tracking[owner_id] = {}
        self.daily_transfer_tracking[owner_id][today] = \
            self.daily_transfer_tracking[owner_id].get(today, 0) + amount

    def validate_jurisdiction(self, jurisdiction: str) -> bool:
        """Check if jurisdiction is allowed"""
        return jurisdiction in self.allowed_jurisdictions


# ============================================================================
# UTXO ENGINE
# ============================================================================

class GENUSDEngine:
    """Core UTXO transaction processing engine"""

    def __init__(self):
        self.utxos: Dict[str, UTXO] = {}  # utxo_id -> UTXO
        self.transactions: Dict[str, Transaction] = {}  # tx_id -> Transaction
        self.total_supply = 0
        self.verified_reserves = 0  # Tracked separately
        self.policy_engine = PolicyEngine()

    # ========================================================================
    # STATE QUERIES
    # ========================================================================

    def get_utxo(self, utxo_id: str) -> Optional[UTXO]:
        """Retrieve UTXO by ID"""
        return self.utxos.get(utxo_id)

    def get_balance(self, owner_id: str) -> int:
        """Get total balance for owner (sum of active UTXOs)"""
        return sum(
            utxo.amount
            for utxo in self.utxos.values()
            if utxo.owner_id == owner_id and utxo.status == UTXOStatus.ACTIVE.value
        )

    def get_owner_utxos(self, owner_id: str) -> List[UTXO]:
        """Get all active UTXOs for owner"""
        return [
            utxo for utxo in self.utxos.values()
            if utxo.owner_id == owner_id and utxo.status == UTXOStatus.ACTIVE.value
        ]

    def get_total_supply(self) -> int:
        """Get total active supply"""
        return self.total_supply

    # ========================================================================
    # ADMIN OPERATIONS
    # ========================================================================

    def set_verified_reserves(self, amount: int):
        """Update verified fiat reserves (admin only)"""
        self.verified_reserves = amount

    def freeze_utxo(self, utxo_id: str, reason: str) -> Tuple[bool, str]:
        """Freeze a UTXO (admin only)"""
        utxo = self.get_utxo(utxo_id)
        if not utxo:
            return False, f"UTXO {utxo_id} not found"

        if utxo.status == UTXOStatus.SPENT.value:
            return False, f"Cannot freeze spent UTXO {utxo_id}"

        utxo.status = UTXOStatus.FROZEN.value
        utxo.metadata.freeze_reason = reason
        return True, f"UTXO {utxo_id} frozen"

    def unfreeze_utxo(self, utxo_id: str) -> Tuple[bool, str]:
        """Unfreeze a UTXO (admin only)"""
        utxo = self.get_utxo(utxo_id)
        if not utxo:
            return False, f"UTXO {utxo_id} not found"

        if utxo.status != UTXOStatus.FROZEN.value:
            return False, f"UTXO {utxo_id} is not frozen"

        utxo.status = UTXOStatus.ACTIVE.value
        utxo.metadata.freeze_reason = None
        return True, f"UTXO {utxo_id} unfrozen"

    # ========================================================================
    # TRANSACTION PROCESSING
    # ========================================================================

    def process_transaction(self, tx_data: dict) -> Tuple[bool, str, Optional[str]]:
        """
        Main transaction processing entry point.

        Returns: (success, message, tx_id)
        """
        # Parse transaction
        try:
            tx = Transaction(**tx_data)
        except Exception as e:
            return False, f"Invalid transaction format: {str(e)}", None

        # Route to appropriate handler
        if tx.type == TransactionType.MINT.value:
            return self._process_mint(tx)
        elif tx.type == TransactionType.TRANSFER.value:
            return self._process_transfer(tx)
        elif tx.type == TransactionType.BURN.value:
            return self._process_burn(tx)
        else:
            return False, f"Unknown transaction type: {tx.type}", None

    # ========================================================================
    # MINT TRANSACTION
    # ========================================================================

    def _process_mint(self, tx: Transaction) -> Tuple[bool, str, Optional[str]]:
        """Process MINT transaction"""

        # 1. Validate schema
        success, msg = self._validate_mint_schema(tx)
        if not success:
            return False, msg, None

        # 2. Validate authorization (issuer signature)
        if "issuer" not in tx.signatures:
            return False, "MINT requires issuer signature", None

        # 3. Validate reserve backing
        total_mint_amount = sum(out['amount'] for out in tx.outputs)
        if self.total_supply + total_mint_amount > self.verified_reserves:
            return False, f"Insufficient reserves. Supply would be ${(self.total_supply + total_mint_amount)/100:.2f}, reserves are ${self.verified_reserves/100:.2f}", None

        # 4. Validate policy limits
        policy = self.policy_engine.policies.get(tx.policy_ref)
        if not policy:
            return False, f"Unknown policy: {tx.policy_ref}", None

        if total_mint_amount > policy["max_mint_per_tx"]:
            return False, f"Mint amount ${total_mint_amount/100:.2f} exceeds max ${policy['max_mint_per_tx']/100:.2f}", None

        # 5. Validate outputs
        for idx, out in enumerate(tx.outputs):
            success, msg = self._validate_output(out, idx)
            if not success:
                return False, f"Output {idx}: {msg}", None

        # 6. Execute: Create outputs
        for idx, out in enumerate(tx.outputs):
            utxo_id = f"{tx.tx_id}:{idx}"
            utxo = self._create_utxo(utxo_id, out, tx.timestamp)
            self.utxos[utxo_id] = utxo

        # 7. Update state
        self.total_supply += total_mint_amount
        self.transactions[tx.tx_id] = tx

        return True, f"MINT successful: {len(tx.outputs)} UTXOs created, ${total_mint_amount/100:.2f} minted", tx.tx_id

    def _validate_mint_schema(self, tx: Transaction) -> Tuple[bool, str]:
        """Validate MINT transaction schema"""
        if tx.inputs:
            return False, "MINT transaction must have empty inputs"

        if not tx.outputs:
            return False, "MINT transaction must have at least one output"

        return True, ""

    # ========================================================================
    # TRANSFER TRANSACTION
    # ========================================================================

    def _process_transfer(self, tx: Transaction) -> Tuple[bool, str, Optional[str]]:
        """Process TRANSFER transaction"""

        # 1. Validate schema
        success, msg = self._validate_transfer_schema(tx)
        if not success:
            return False, msg, None

        # 2. Validate inputs exist and are spendable
        input_utxos = []
        for utxo_id in tx.inputs:
            utxo = self.get_utxo(utxo_id)
            if not utxo:
                return False, f"Input UTXO {utxo_id} not found", None

            if utxo.status != UTXOStatus.ACTIVE.value:
                return False, f"Input UTXO {utxo_id} is not active (status: {utxo.status})", None

            input_utxos.append(utxo)

        # 3. Validate ownership (all inputs must have same owner)
        owner_ids = set(utxo.owner_id for utxo in input_utxos)
        if len(owner_ids) > 1:
            return False, "All input UTXOs must belong to the same owner", None

        owner_id = input_utxos[0].owner_id

        # 4. Validate sender signature
        if owner_id not in tx.signatures:
            return False, f"Missing signature from owner {owner_id}", None

        # 5. Validate no blacklisted or frozen inputs
        for utxo in input_utxos:
            if utxo.metadata.blacklist_flag:
                return False, f"Input UTXO {utxo.utxo_id} belongs to blacklisted owner", None

            if self.policy_engine.is_blacklisted(utxo.owner_id):
                return False, f"Owner {utxo.owner_id} is blacklisted", None

        # 6. Validate conservation of value
        input_sum = sum(utxo.amount for utxo in input_utxos)
        output_sum = sum(out['amount'] for out in tx.outputs)

        if input_sum != output_sum:
            return False, f"Input sum (${input_sum/100:.2f}) != Output sum (${output_sum/100:.2f})", None

        # 7. Validate outputs
        for idx, out in enumerate(tx.outputs):
            success, msg = self._validate_output(out, idx)
            if not success:
                return False, f"Output {idx}: {msg}", None

            # Check recipient KYC and daily limits
            recipient_id = out['owner_id']
            recipient_kyc = self.policy_engine.get_kyc_level(recipient_id)
            if not recipient_kyc:
                return False, f"Recipient {recipient_id} has no KYC registration", None

            # Check recipient not blacklisted
            if self.policy_engine.is_blacklisted(recipient_id):
                return False, f"Recipient {recipient_id} is blacklisted", None

        # 8. Check sender daily limit
        success, msg = self.policy_engine.check_daily_limit(owner_id, output_sum)
        if not success:
            return False, msg, None

        # 9. Execute: Mark inputs as spent
        for utxo in input_utxos:
            utxo.status = UTXOStatus.SPENT.value

        # 10. Execute: Create outputs
        for idx, out in enumerate(tx.outputs):
            utxo_id = f"{tx.tx_id}:{idx}"
            utxo = self._create_utxo(utxo_id, out, tx.timestamp)
            self.utxos[utxo_id] = utxo

        # 11. Update state
        self.policy_engine.record_transfer(owner_id, output_sum)
        self.transactions[tx.tx_id] = tx

        return True, f"TRANSFER successful: {len(tx.inputs)} inputs spent, {len(tx.outputs)} outputs created", tx.tx_id

    def _validate_transfer_schema(self, tx: Transaction) -> Tuple[bool, str]:
        """Validate TRANSFER transaction schema"""
        if not tx.inputs:
            return False, "TRANSFER transaction must have at least one input"

        if not tx.outputs:
            return False, "TRANSFER transaction must have at least one output"

        return True, ""

    # ========================================================================
    # BURN TRANSACTION
    # ========================================================================

    def _process_burn(self, tx: Transaction) -> Tuple[bool, str, Optional[str]]:
        """Process BURN transaction"""

        # 1. Validate schema
        success, msg = self._validate_burn_schema(tx)
        if not success:
            return False, msg, None

        # 2. Validate inputs exist and are spendable
        input_utxos = []
        for utxo_id in tx.inputs:
            utxo = self.get_utxo(utxo_id)
            if not utxo:
                return False, f"Input UTXO {utxo_id} not found", None

            if utxo.status != UTXOStatus.ACTIVE.value:
                return False, f"Input UTXO {utxo_id} is not active (status: {utxo.status})", None

            input_utxos.append(utxo)

        # 3. Validate authorization (issuer OR owner)
        owner_ids = set(utxo.owner_id for utxo in input_utxos)
        has_issuer_sig = "issuer" in tx.signatures
        has_owner_sig = any(owner_id in tx.signatures for owner_id in owner_ids)

        if not (has_issuer_sig or has_owner_sig):
            return False, "BURN requires issuer or owner signature", None

        # 4. Validate minimum burn amount
        policy = self.policy_engine.policies.get(tx.policy_ref)
        if not policy:
            return False, f"Unknown policy: {tx.policy_ref}", None

        burn_amount = sum(utxo.amount for utxo in input_utxos)
        if burn_amount < policy["min_burn_amount"]:
            return False, f"Burn amount ${burn_amount/100:.2f} below minimum ${policy['min_burn_amount']/100:.2f}", None

        # 5. Execute: Mark inputs as spent
        for utxo in input_utxos:
            utxo.status = UTXOStatus.SPENT.value

        # 6. Update state
        self.total_supply -= burn_amount
        self.transactions[tx.tx_id] = tx

        return True, f"BURN successful: {len(tx.inputs)} UTXOs burned, ${burn_amount/100:.2f} destroyed", tx.tx_id

    def _validate_burn_schema(self, tx: Transaction) -> Tuple[bool, str]:
        """Validate BURN transaction schema"""
        if not tx.inputs:
            return False, "BURN transaction must have at least one input"

        if tx.outputs:
            return False, "BURN transaction must have empty outputs"

        return True, ""

    # ========================================================================
    # HELPER METHODS
    # ========================================================================

    def _validate_output(self, output: dict, idx: int) -> Tuple[bool, str]:
        """Validate output UTXO structure and compliance"""

        # Required fields
        required = ['owner_id', 'asset_code', 'amount', 'status', 'kyc_tag', 'created_at', 'metadata']
        for field in required:
            if field not in output:
                return False, f"Missing required field: {field}"

        # Validate asset code
        if output['asset_code'] != ASSET_CODE:
            return False, f"Invalid asset_code: {output['asset_code']}, expected {ASSET_CODE}"

        # Validate amount
        if output['amount'] <= 0:
            return False, "Amount must be > 0"

        if output['amount'] > MAX_UTXO_AMOUNT:
            return False, f"Amount exceeds maximum {MAX_UTXO_AMOUNT}"

        # Validate status
        if output['status'] != UTXOStatus.ACTIVE.value:
            return False, f"New UTXOs must have status 'active', got '{output['status']}'"

        # Validate KYC tag
        try:
            kyc_level = KYCLevel(output['kyc_tag'])
            if kyc_level == KYCLevel.LEVEL_0:
                return False, "KYC_LEVEL_0 not allowed for GENUSD"
        except ValueError:
            return False, f"Invalid kyc_tag: {output['kyc_tag']}"

        # Validate metadata
        metadata = output['metadata']
        if not self.policy_engine.validate_jurisdiction(metadata['jurisdiction']):
            return False, f"Jurisdiction {metadata['jurisdiction']} not allowed"

        return True, ""

    def _create_utxo(self, utxo_id: str, output: dict, timestamp: int) -> UTXO:
        """Create UTXO object from output specification"""
        metadata = UTXOMetadata(**output['metadata'])
        return UTXO(
            utxo_id=utxo_id,
            owner_id=output['owner_id'],
            asset_code=output['asset_code'],
            amount=output['amount'],
            status=output['status'],
            kyc_tag=output['kyc_tag'],
            created_at=timestamp,
            metadata=metadata
        )

    # ========================================================================
    # UTILITY METHODS
    # ========================================================================

    def export_state(self) -> dict:
        """Export entire engine state (for testing/debugging)"""
        return {
            "utxos": {utxo_id: utxo.to_dict() for utxo_id, utxo in self.utxos.items()},
            "transactions": {tx_id: tx.to_dict() for tx_id, tx in self.transactions.items()},
            "total_supply": self.total_supply,
            "verified_reserves": self.verified_reserves
        }

    def import_state(self, state: dict):
        """Import engine state (for testing/debugging)"""
        self.utxos = {
            utxo_id: UTXO.from_dict(utxo_data)
            for utxo_id, utxo_data in state.get("utxos", {}).items()
        }
        self.transactions = {
            tx_id: Transaction(**tx_data)
            for tx_id, tx_data in state.get("transactions", {}).items()
        }
        self.total_supply = state.get("total_supply", 0)
        self.verified_reserves = state.get("verified_reserves", 0)


# ============================================================================
# MOCK CRYPTOGRAPHY (Phase 2 - Simplified)
# ============================================================================

def generate_mock_signature(signer_id: str, data: str) -> str:
    """Generate mock signature for testing"""
    combined = f"{signer_id}:{data}"
    return f"SIG_{hashlib.sha256(combined.encode()).hexdigest()[:16]}"


def generate_attestation(data: str) -> str:
    """Generate mock issuer attestation"""
    return f"SHA256:{hashlib.sha256(data.encode()).hexdigest()[:16]}"


# ============================================================================
# MAIN (Example Usage)
# ============================================================================

if __name__ == "__main__":
    # Initialize engine
    engine = GENUSDEngine()

    # Set up reserves
    engine.set_verified_reserves(100_000_000)  # $1M reserves

    # Register users with KYC
    engine.policy_engine.register_kyc("x509::/C=US/ST=CA/O=Org1/CN=treasury", "KYC_LEVEL_3")
    engine.policy_engine.register_kyc("x509::/C=US/ST=NY/O=Org1/CN=merchant", "KYC_LEVEL_2")

    # Example 1: MINT transaction
    mint_tx = {
        "type": "MINT",
        "tx_id": "MINT_20251128_001",
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
                "issuer_attestation": generate_attestation("reserve_proof_1")
            }
        }],
        "policy_ref": "POLICY_V1.0",
        "signatures": {"issuer": generate_mock_signature("issuer", "MINT_20251128_001")},
        "metadata": {"memo": "Initial mint $1,000"}
    }

    success, msg, tx_id = engine.process_transaction(mint_tx)
    print(f"MINT: {msg}")
    print(f"Total supply: ${engine.get_total_supply()/100:.2f}\n")

    # Example 2: TRANSFER transaction
    transfer_tx = {
        "type": "TRANSFER",
        "tx_id": "TRANSFER_20251128_002",
        "timestamp": int(time.time()),
        "inputs": ["MINT_20251128_001:0"],
        "outputs": [
            {
                "owner_id": "x509::/C=US/ST=NY/O=Org1/CN=merchant",
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
                    "issuer_attestation": generate_attestation("reserve_proof_1")
                }
            },
            {
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
                    "issuer_attestation": generate_attestation("reserve_proof_1")
                }
            }
        ],
        "policy_ref": "POLICY_V1.0",
        "signatures": {
            "x509::/C=US/ST=CA/O=Org1/CN=treasury": generate_mock_signature("treasury", "TRANSFER_20251128_002")
        },
        "metadata": {"memo": "Payment to merchant"}
    }

    success, msg, tx_id = engine.process_transaction(transfer_tx)
    print(f"TRANSFER: {msg}")
    print(f"Merchant balance: ${engine.get_balance('x509::/C=US/ST=NY/O=Org1/CN=merchant')/100:.2f}")
    print(f"Treasury balance: ${engine.get_balance('x509::/C=US/ST=CA/O=Org1/CN=treasury')/100:.2f}\n")
