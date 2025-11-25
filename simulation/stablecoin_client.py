"""
Stablecoin Client - Python wrapper for Hyperledger Fabric Stablecoin REST API

This module provides a clean Python interface to interact with the stablecoin
REST API running on Hyperledger Fabric. It wraps all chaincode operations
(mint, transfer, burn, balance queries) with proper error handling and logging.

Architecture:
- REST API: http://localhost:3000
- Chaincode: stablecoincc deployed on Fabric test-network
- Methods: Synchronous HTTP requests using the requests library

Usage:
    from stablecoin_client import StablecoinClient
    
    client = StablecoinClient(base_url="http://localhost:3000")
    
    # Mint tokens
    result = client.mint("central_bank", 1000000)
    
    # Transfer tokens
    result = client.transfer("central_bank", "bank_a", 10000)
    
    # Burn tokens
    result = client.burn("bank_a", 100)
    
    # Query balance
    balance = client.get_balance("bank_a")
    
    # Query total supply
    supply = client.get_total_supply()
"""

import requests
import time
import logging
from typing import Dict, Optional, Any
from dataclasses import dataclass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class TransactionMetrics:
    """Data class to track transaction metrics"""
    total_transactions: int = 0
    successful_transactions: int = 0
    failed_transactions: int = 0
    start_time: float = 0
    end_time: float = 0
    
    def record_success(self):
        """Record a successful transaction"""
        self.total_transactions += 1
        self.successful_transactions += 1
    
    def record_failure(self):
        """Record a failed transaction"""
        self.total_transactions += 1
        self.failed_transactions += 1
    
    def get_success_rate(self) -> float:
        """Calculate success rate as percentage"""
        if self.total_transactions == 0:
            return 0.0
        return (self.successful_transactions / self.total_transactions) * 100
    
    def get_duration(self) -> float:
        """Calculate total duration in seconds"""
        if self.start_time == 0:
            return 0.0
        end = self.end_time if self.end_time > 0 else time.time()
        return end - self.start_time
    
    def get_transactions_per_second(self) -> float:
        """Calculate average transactions per second"""
        duration = self.get_duration()
        if duration == 0:
            return 0.0
        return self.total_transactions / duration
    
    def start(self):
        """Start the metrics timer"""
        self.start_time = time.time()
    
    def stop(self):
        """Stop the metrics timer"""
        self.end_time = time.time()
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of all metrics"""
        return {
            'total_transactions': self.total_transactions,
            'successful_transactions': self.successful_transactions,
            'failed_transactions': self.failed_transactions,
            'success_rate': f"{self.get_success_rate():.2f}%",
            'duration_seconds': f"{self.get_duration():.2f}",
            'transactions_per_second': f"{self.get_transactions_per_second():.2f}"
        }


@dataclass
class TransactionResult:
    """Data class to represent transaction results"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None


class StablecoinClient:
    """
    Python client for Hyperledger Fabric Stablecoin REST API
    
    This client provides methods to interact with a stablecoin chaincode
    deployed on Hyperledger Fabric through a REST API interface.
    
    Attributes:
        base_url (str): Base URL of the REST API (default: http://localhost:3000)
        timeout (int): Request timeout in seconds (default: 30)
        session (requests.Session): Reusable HTTP session for connection pooling
    """
    
    def __init__(self, base_url: str = "http://localhost:3000", timeout: int = 30):
        """
        Initialize the Stablecoin client
        
        Args:
            base_url: Base URL of the REST API
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.metrics = TransactionMetrics()
        
        logger.info(f"Initialized StablecoinClient with base_url={self.base_url}")
    
    def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None
    ) -> TransactionResult:
        """
        Internal method to make HTTP requests with error handling
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            data: Request payload (for POST requests)
            
        Returns:
            TransactionResult object with success status and data/error
        """
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, timeout=self.timeout)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, timeout=self.timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            duration_ms = (time.time() - start_time) * 1000
            
            # Check if request was successful
            if response.status_code == 200:
                result_data = response.json()
                if result_data.get('success', True):
                    self.metrics.record_success()
                    return TransactionResult(
                        success=True,
                        data=result_data.get('data', result_data),
                        duration_ms=duration_ms
                    )
                else:
                    error_msg = result_data.get('error', 'Unknown error')
                    logger.error(f"API error: {error_msg}")
                    self.metrics.record_failure()
                    return TransactionResult(
                        success=False,
                        error=error_msg,
                        duration_ms=duration_ms
                    )
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"Request failed: {error_msg}")
                self.metrics.record_failure()
                return TransactionResult(
                    success=False,
                    error=error_msg,
                    duration_ms=duration_ms
                )
                
        except requests.exceptions.Timeout:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = f"Request timeout after {self.timeout}s"
            logger.error(error_msg)
            self.metrics.record_failure()
            return TransactionResult(success=False, error=error_msg, duration_ms=duration_ms)
            
        except requests.exceptions.ConnectionError as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = f"Connection error: {str(e)}"
            logger.error(error_msg)
            self.metrics.record_failure()
            return TransactionResult(success=False, error=error_msg, duration_ms=duration_ms)
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(error_msg)
            self.metrics.record_failure()
            return TransactionResult(success=False, error=error_msg, duration_ms=duration_ms)
    
    def health_check(self) -> bool:
        """
        Check if the API server is healthy and responsive
        
        Returns:
            True if server is healthy, False otherwise
        """
        logger.info("Performing health check...")
        result = self._make_request('GET', '/health')
        
        if result.success:
            logger.info("✓ Server is healthy")
            return True
        else:
            logger.error(f"✗ Server health check failed: {result.error}")
            return False
    
    def mint(self, account_id: str, amount: float) -> TransactionResult:
        """
        Mint new tokens to an account (admin operation)
        
        This operation creates new tokens and adds them to the specified account.
        Only admin users (Org1MSP) can perform minting operations.
        
        Args:
            account_id: Target account identifier
            amount: Number of tokens to mint (must be positive)
            
        Returns:
            TransactionResult with transaction details
            
        Example:
            result = client.mint("central_bank", 1000000)
            if result.success:
                print(f"Minted {result.data['amount']} tokens")
                print(f"New balance: {result.data['newBalance']}")
                print(f"New total supply: {result.data['newTotalSupply']}")
        """
        logger.info(f"Minting {amount} tokens to {account_id}")
        
        payload = {
            "accountId": account_id,
            "amount": str(amount)
        }
        
        result = self._make_request('POST', '/mint', payload)
        
        if result.success:
            logger.info(f"✓ Minted {amount} to {account_id} (duration: {result.duration_ms:.2f}ms)")
        else:
            logger.error(f"✗ Mint failed: {result.error}")
            
        return result
    
    def transfer(self, from_account: str, to_account: str, amount: float) -> TransactionResult:
        """
        Transfer tokens between accounts
        
        Performs a peer-to-peer transfer of tokens. The sender must have
        sufficient balance and cannot be frozen.
        
        Args:
            from_account: Sender account identifier
            to_account: Receiver account identifier
            amount: Number of tokens to transfer (must be positive)
            
        Returns:
            TransactionResult with transaction details
            
        Example:
            result = client.transfer("bank_a", "user_1", 100)
            if result.success:
                print(f"From balance: {result.data['fromBalance']}")
                print(f"To balance: {result.data['toBalance']}")
        """
        logger.debug(f"Transferring {amount} from {from_account} to {to_account}")
        
        payload = {
            "from": from_account,
            "to": to_account,
            "amount": str(amount)
        }
        
        result = self._make_request('POST', '/transfer', payload)
        
        if result.success:
            logger.debug(f"✓ Transferred {amount} (duration: {result.duration_ms:.2f}ms)")
        else:
            logger.error(f"✗ Transfer failed: {result.error}")
            
        return result
    
    def burn(self, account_id: str, amount: float) -> TransactionResult:
        """
        Burn (destroy) tokens from an account
        
        Permanently removes tokens from circulation by burning them from
        the specified account. The account must have sufficient balance.
        
        Args:
            account_id: Account to burn tokens from
            amount: Number of tokens to burn (must be positive)
            
        Returns:
            TransactionResult with transaction details
            
        Example:
            result = client.burn("bank_a", 500)
            if result.success:
                print(f"Burned {result.data['amount']} tokens")
                print(f"New balance: {result.data['newBalance']}")
                print(f"New total supply: {result.data['newTotalSupply']}")
        """
        logger.info(f"Burning {amount} tokens from {account_id}")
        
        payload = {
            "accountId": account_id,
            "amount": str(amount)
        }
        
        result = self._make_request('POST', '/burn', payload)
        
        if result.success:
            logger.info(f"✓ Burned {amount} from {account_id} (duration: {result.duration_ms:.2f}ms)")
        else:
            logger.error(f"✗ Burn failed: {result.error}")
            
        return result
    
    def get_balance(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        Query the balance of an account
        
        Args:
            account_id: Account identifier to query
            
        Returns:
            Dictionary with balance information or None if failed
            Format: {
                "accountId": str,
                "balance": float,
                "frozen": bool
            }
            
        Example:
            balance_info = client.get_balance("bank_a")
            if balance_info:
                print(f"Balance: {balance_info['balance']}")
                print(f"Frozen: {balance_info['frozen']}")
        """
        logger.debug(f"Querying balance for {account_id}")
        
        result = self._make_request('GET', f'/balance/{account_id}')
        
        if result.success:
            logger.debug(f"✓ Balance query successful (duration: {result.duration_ms:.2f}ms)")
            return result.data
        else:
            logger.error(f"✗ Balance query failed: {result.error}")
            return None
    
    def get_total_supply(self) -> Optional[float]:
        """
        Query the total supply of tokens in circulation
        
        Returns:
            Total supply as float, or None if failed
            
        Example:
            supply = client.get_total_supply()
            if supply is not None:
                print(f"Total supply: {supply:,.2f} tokens")
        """
        logger.debug("Querying total supply")
        
        result = self._make_request('GET', '/totalsupply')
        
        if result.success:
            total_supply = result.data.get('totalSupply', 0)
            logger.debug(f"✓ Total supply: {total_supply:,.2f} (duration: {result.duration_ms:.2f}ms)")
            return total_supply
        else:
            logger.error(f"✗ Total supply query failed: {result.error}")
            return None
    
    def get_account_history(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        Get transaction history for an account
        
        Args:
            account_id: Account identifier to query
            
        Returns:
            Dictionary with transaction history or None if failed
            Format: {
                "accountId": str,
                "history": List[Dict] - list of historical transactions
            }
            
        Example:
            history = client.get_account_history("bank_a")
            if history:
                print(f"Found {len(history['history'])} transactions")
        """
        logger.debug(f"Querying history for {account_id}")
        
        result = self._make_request('GET', f'/history/{account_id}')
        
        if result.success:
            logger.debug(f"✓ History query successful (duration: {result.duration_ms:.2f}ms)")
            return result.data
        else:
            logger.error(f"✗ History query failed: {result.error}")
            return None
    
    def freeze_account(self, account_id: str) -> TransactionResult:
        """
        Freeze an account (admin operation)
        
        Frozen accounts cannot send transfers but can still receive tokens.
        Only admin users can freeze accounts.
        
        Args:
            account_id: Account to freeze
            
        Returns:
            TransactionResult with operation status
        """
        logger.info(f"Freezing account {account_id}")
        
        payload = {"accountId": account_id}
        result = self._make_request('POST', '/freeze', payload)
        
        if result.success:
            logger.info(f"✓ Account {account_id} frozen")
        else:
            logger.error(f"✗ Freeze failed: {result.error}")
            
        return result
    
    def unfreeze_account(self, account_id: str) -> TransactionResult:
        """
        Unfreeze an account (admin operation)
        
        Restores transfer capabilities to a frozen account.
        Only admin users can unfreeze accounts.
        
        Args:
            account_id: Account to unfreeze
            
        Returns:
            TransactionResult with operation status
        """
        logger.info(f"Unfreezing account {account_id}")
        
        payload = {"accountId": account_id}
        result = self._make_request('POST', '/unfreeze', payload)
        
        if result.success:
            logger.info(f"✓ Account {account_id} unfrozen")
        else:
            logger.error(f"✗ Unfreeze failed: {result.error}")
            
        return result
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get current transaction metrics
        
        Returns:
            Dictionary containing metrics summary
        """
        return self.metrics.get_summary()
    
    def reset_metrics(self):
        """Reset all transaction metrics to zero"""
        self.metrics = TransactionMetrics()
        logger.info("Metrics reset")
    
    def start_metrics(self):
        """Start tracking metrics (starts the timer)"""
        self.metrics.start()
        logger.info("Metrics tracking started")
    
    def stop_metrics(self):
        """Stop tracking metrics (stops the timer)"""
        self.metrics.stop()
        logger.info("Metrics tracking stopped")
    
    def close(self):
        """Close the HTTP session and release resources"""
        self.session.close()
        logger.info("Closed StablecoinClient session")
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - ensures session is closed"""
        self.close()


# Convenience functions for quick operations
def quick_mint(account_id: str, amount: float, base_url: str = "http://localhost:3000") -> bool:
    """Quick mint operation without creating a persistent client"""
    with StablecoinClient(base_url) as client:
        result = client.mint(account_id, amount)
        return result.success


def quick_transfer(
    from_account: str, 
    to_account: str, 
    amount: float, 
    base_url: str = "http://localhost:3000"
) -> bool:
    """Quick transfer operation without creating a persistent client"""
    with StablecoinClient(base_url) as client:
        result = client.transfer(from_account, to_account, amount)
        return result.success


def quick_balance(account_id: str, base_url: str = "http://localhost:3000") -> Optional[float]:
    """Quick balance query without creating a persistent client"""
    with StablecoinClient(base_url) as client:
        balance_info = client.get_balance(account_id)
        return balance_info['balance'] if balance_info else None


if __name__ == "__main__":
    """
    Example usage and basic testing
    
    Run this script directly to test the client:
        python stablecoin_client.py
    """
    print("=" * 60)
    print("Stablecoin Client - Basic Test")
    print("=" * 60)
    
    # Create client
    client = StablecoinClient()
    
    # Health check
    print("\n1. Health Check:")
    client.metrics.start()  # Start metrics tracking
    if client.health_check():
        print("   ✓ API server is running")
    else:
        print("   ✗ API server is not accessible")
        exit(1)
    
    # Test mint
    print("\n2. Testing Mint Operation:")
    result = client.mint("test_account", 1000)
    if result.success:
        print(f"   ✓ Minted successfully")
        print(f"   Duration: {result.duration_ms:.2f}ms")
    
    # Test balance query
    print("\n3. Testing Balance Query:")
    balance_info = client.get_balance("test_account")
    if balance_info:
        print(f"   ✓ Balance: {balance_info['balance']}")
        print(f"   Frozen: {balance_info['frozen']}")
    
    # Test transfer
    print("\n4. Testing Transfer Operation:")
    result = client.transfer("test_account", "test_account_2", 100)
    if result.success:
        print(f"   ✓ Transfer successful")
    
    # Test total supply
    print("\n5. Testing Total Supply Query:")
    supply = client.get_total_supply()
    if supply is not None:
        print(f"   ✓ Total Supply: {supply:,.2f}")
    
    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)
    
    # Display metrics
    print("\n" + "=" * 60)
    print("TRANSACTION METRICS")
    print("=" * 60)
    client.metrics.stop()
    metrics_summary = client.metrics.get_summary()
    print(f"Total Transactions: {metrics_summary['total_transactions']}")
    print(f"Successful: {metrics_summary['successful_transactions']}")
    print(f"Failed: {metrics_summary['failed_transactions']}")
    print(f"Success Rate: {metrics_summary['success_rate']}")
    print(f"Duration: {metrics_summary['duration_seconds']}s")
    print(f"Throughput: {metrics_summary['transactions_per_second']} tx/s")
    print("=" * 60)
    
    # Clean up
    client.close()
