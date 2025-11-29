"""
Data models for GENUSD SDK
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Literal


@dataclass
class UTXO:
    """Unspent Transaction Output"""
    owner_id: str
    amount: int
    asset_code: str
    kyc_tag: Optional[str] = None
    utxo_id: Optional[str] = None
    status: Optional[Literal["active", "spent", "frozen"]] = "active"
    created_at: Optional[int] = None


@dataclass
class MintRequest:
    """Request to mint new stablecoins"""
    outputs: List[UTXO]
    issuer_id: str
    dilithium_signature: str = ""


@dataclass
class TransferRequest:
    """Request to transfer stablecoins"""
    inputs: List[str]  # UTXO IDs
    outputs: List[UTXO]
    sender_id: str
    dilithium_signature: str = ""


@dataclass
class BurnRequest:
    """Request to burn stablecoins"""
    inputs: List[str]  # UTXO IDs to burn
    burner_id: str
    dilithium_signature: str = ""


@dataclass
class GovernanceRequest:
    """Request for governance action"""
    action: Literal["freeze", "unfreeze", "seize", "redeem", "attest"]
    admin_id: str
    dilithium_signature: str = ""
    target_user: Optional[str] = None
    target_utxo: Optional[str] = None
    amount: Optional[int] = None
    reason: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ZKProof:
    """Zero-knowledge proof structure"""
    proof_bytes: str
    public_inputs: List[str]
    commitment: str
    nullifier: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class APIResponse:
    """API response wrapper"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    tx_id: Optional[str] = None
