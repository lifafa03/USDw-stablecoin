"""
GENUSD SDK Client - Python Implementation

Provides high-level interface for GENUSD stablecoin operations.
"""

import hashlib
import json
import time
from typing import Dict, List, Optional, Any
from dataclasses import asdict

import requests

from .models import (
    UTXO,
    MintRequest,
    TransferRequest,
    BurnRequest,
    GovernanceRequest,
    ZKProof,
    APIResponse,
)


class GENUSDClient:
    """
    GENUSD SDK Client for Python
    
    Provides methods to interact with GENUSD stablecoin chaincode via REST API.
    
    Args:
        api_url: Base URL of the GENUSD API
        api_key: Optional API key for authentication
        timeout: Request timeout in seconds (default: 30)
        enable_mock_signatures: Use mock Dilithium signatures for testing (default: False)
    
    Example:
        >>> client = GENUSDClient(
        ...     api_url="http://localhost:3000/api/v1",
        ...     enable_mock_signatures=True
        ... )
        >>> result = client.get_balance("user_alice")
    """
    
    def __init__(
        self,
        api_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30,
        enable_mock_signatures: bool = False,
    ):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.enable_mock_signatures = enable_mock_signatures
        
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        if api_key:
            self.session.headers.update({"X-API-Key": api_key})
    
    def _generate_mock_signature(self, message: str) -> str:
        """Generate mock Dilithium signature for testing"""
        if not self.enable_mock_signatures:
            raise ValueError("Mock signatures disabled. Use real Dilithium signing.")
        
        hash_digest = hashlib.sha256(message.encode()).hexdigest()
        return f"MOCK_DILITHIUM_SIG_{hash_digest[:32]}"
    
    def _create_signature_headers(self, message: str, signer_id: str) -> Dict[str, str]:
        """Create Dilithium signature headers for API request"""
        timestamp = int(time.time() * 1000)
        signature = (
            self._generate_mock_signature(message)
            if self.enable_mock_signatures
            else message  # In production, use real Dilithium library
        )
        
        return {
            "X-Dilithium-Signature": signature,
            "X-Dilithium-Signer": signer_id,
            "X-Timestamp": str(timestamp),
        }
    
    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None,
    ) -> APIResponse:
        """Make HTTP request to API"""
        url = f"{self.api_url}{endpoint}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=headers or {},
                timeout=self.timeout,
            )
            
            if response.status_code >= 400:
                return APIResponse(
                    success=False,
                    error=response.json().get("error", f"HTTP {response.status_code}"),
                )
            
            result = response.json()
            return APIResponse(**result)
        
        except requests.RequestException as e:
            return APIResponse(success=False, error=str(e))
    
    def mint(self, request: MintRequest) -> APIResponse:
        """
        Mint new stablecoins (issuer only)
        
        Args:
            request: MintRequest containing outputs, issuer_id, and signature
        
        Returns:
            APIResponse with created UTXO IDs
        
        Example:
            >>> request = MintRequest(
            ...     outputs=[UTXO(owner_id="alice", amount=1000000, asset_code="GENUSD")],
            ...     issuer_id="issuer_001",
            ...     dilithium_signature=""
            ... )
            >>> result = client.mint(request)
        """
        message = json.dumps({
            "action": "mint",
            "outputs": [asdict(utxo) for utxo in request.outputs],
            "issuer_id": request.issuer_id,
        })
        
        headers = self._create_signature_headers(message, request.issuer_id)
        
        data = {
            "outputs": [asdict(utxo) for utxo in request.outputs],
            "issuer_id": request.issuer_id,
            "dilithium_signature": request.dilithium_signature or headers["X-Dilithium-Signature"],
        }
        
        return self._request("POST", "/mint", data=data, headers=headers)
    
    def transfer(self, request: TransferRequest) -> APIResponse:
        """
        Transfer stablecoins between users
        
        Args:
            request: TransferRequest containing inputs, outputs, sender_id, and signature
        
        Returns:
            APIResponse with new UTXO IDs
        
        Example:
            >>> request = TransferRequest(
            ...     inputs=["UTXO_TX123:0"],
            ...     outputs=[UTXO(owner_id="bob", amount=500000, asset_code="GENUSD")],
            ...     sender_id="alice",
            ...     dilithium_signature=""
            ... )
            >>> result = client.transfer(request)
        """
        message = json.dumps({
            "action": "transfer",
            "inputs": request.inputs,
            "outputs": [asdict(utxo) for utxo in request.outputs],
            "sender_id": request.sender_id,
        })
        
        headers = self._create_signature_headers(message, request.sender_id)
        
        data = {
            "inputs": request.inputs,
            "outputs": [asdict(utxo) for utxo in request.outputs],
            "sender_id": request.sender_id,
            "dilithium_signature": request.dilithium_signature or headers["X-Dilithium-Signature"],
        }
        
        return self._request("POST", "/transfer", data=data, headers=headers)
    
    def burn(self, request: BurnRequest) -> APIResponse:
        """
        Burn stablecoins (destroy tokens)
        
        Args:
            request: BurnRequest containing inputs, burner_id, and signature
        
        Returns:
            APIResponse with burned amount
        """
        message = json.dumps({
            "action": "burn",
            "inputs": request.inputs,
            "burner_id": request.burner_id,
        })
        
        headers = self._create_signature_headers(message, request.burner_id)
        
        data = {
            "inputs": request.inputs,
            "burner_id": request.burner_id,
            "dilithium_signature": request.dilithium_signature or headers["X-Dilithium-Signature"],
        }
        
        return self._request("POST", "/burn", data=data, headers=headers)
    
    def get_utxo(self, utxo_id: str) -> APIResponse:
        """Get UTXO by ID"""
        return self._request("GET", f"/utxo/{utxo_id}")
    
    def get_balance(self, user_id: str) -> APIResponse:
        """Get user balance (sum of active UTXOs)"""
        return self._request("GET", f"/balance/{user_id}")
    
    def governance(self, request: GovernanceRequest) -> APIResponse:
        """
        Execute governance action
        
        Args:
            request: GovernanceRequest with action type and parameters
        
        Returns:
            APIResponse indicating success/failure
        """
        endpoint = f"/policy/{request.action}"
        message = json.dumps(asdict(request))
        headers = self._create_signature_headers(message, request.admin_id)
        
        data = {
            **asdict(request),
            "dilithium_signature": request.dilithium_signature or headers["X-Dilithium-Signature"],
        }
        
        return self._request("POST", endpoint, data=data, headers=headers)
    
    def verify_zk_proof(self, proof: ZKProof) -> APIResponse:
        """Verify zero-knowledge proof"""
        return self._request("POST", "/zk/attest", data={"proof": asdict(proof)})
    
    def get_policy_registry(self) -> APIResponse:
        """Get governance policy registry"""
        return self._request("GET", "/policy/registry")
    
    def get_metrics(self) -> APIResponse:
        """Get Prometheus metrics"""
        return self._request("GET", "/metrics")
    
    def get_audit_events(
        self,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        actor: Optional[str] = None,
        action: Optional[str] = None,
    ) -> APIResponse:
        """
        Get audit events with optional filters
        
        Args:
            start_time: Unix timestamp (ms) - filter events after this time
            end_time: Unix timestamp (ms) - filter events before this time
            actor: Filter by actor ID
            action: Filter by action type
        
        Returns:
            APIResponse with list of audit events
        """
        params = {}
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        if actor:
            params["actor"] = actor
        if action:
            params["action"] = action
        
        return self._request("GET", "/audit/events", params=params)


def create_client(
    api_url: str,
    api_key: Optional[str] = None,
    timeout: int = 30,
    enable_mock_signatures: bool = False,
) -> GENUSDClient:
    """
    Create GENUSD SDK client instance
    
    Args:
        api_url: Base URL of GENUSD API
        api_key: Optional API key
        timeout: Request timeout in seconds
        enable_mock_signatures: Enable mock signatures for testing
    
    Returns:
        Configured GENUSDClient instance
    """
    return GENUSDClient(
        api_url=api_url,
        api_key=api_key,
        timeout=timeout,
        enable_mock_signatures=enable_mock_signatures,
    )
