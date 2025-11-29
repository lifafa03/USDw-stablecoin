"""
GENUSD SDK - Python Client for GENUSD Stablecoin

This SDK provides Python bindings for interacting with the GENUSD stablecoin
chaincode via REST API. Supports all stablecoin operations, governance actions,
and compliance features.

Author: GENUSD Team
License: MIT
"""

__version__ = "1.0.0"

from .client import GENUSDClient, create_client
from .models import (
    UTXO,
    MintRequest,
    TransferRequest,
    BurnRequest,
    GovernanceRequest,
    ZKProof,
    APIResponse,
)

__all__ = [
    "GENUSDClient",
    "create_client",
    "UTXO",
    "MintRequest",
    "TransferRequest",
    "BurnRequest",
    "GovernanceRequest",
    "ZKProof",
    "APIResponse",
]
