"""
OpenCBDC-Style Stablecoin Simulation Runner

This script simulates a Central Bank Digital Currency (CBDC) payment system
using a Hyperledger Fabric stablecoin as the underlying distributed ledger.

Simulation Scenario:
1. Initial Setup: Mint tokens to central bank
2. Distribution: Distribute balances to commercial banks (bank_a, bank_b)
3. Retail Payments: Simulate random transfers between banks and retail users
4. Metrics Collection: Measure throughput, latency, and success rates
5. Final Reconciliation: Verify balances and total supply

This mimics an OpenCBDC-style wholesale CBDC system where:
- Central bank issues digital currency
- Commercial banks hold reserves
- End users make retail payments
- All transactions are settled on distributed ledger

Prerequisites:
- Hyperledger Fabric test-network running
- Stablecoin chaincode deployed
- REST API server running on http://localhost:3000

Usage:
    # Install dependencies
    pip install -r requirements.txt
    
    # Run simulation with default parameters
    python run_simulation.py
    
    # Run with custom parameters
    python run_simulation.py --num-transactions 1000 --num-users 20
    
    # Run with verbose logging
    python run_simulation.py --verbose
"""

import argparse
import random
import time
import sys
from typing import List, Dict, Tuple
from datetime import datetime
from dataclasses import dataclass, field
from stablecoin_client import StablecoinClient, logger
import logging


@dataclass
class SimulationMetrics:
    """Data class to track simulation metrics"""
    total_transactions: int = 0
    successful_transactions: int = 0
    failed_transactions: int = 0
    total_duration_sec: float = 0.0
    transaction_durations_ms: List[float] = field(default_factory=list)
    
    @property
    def success_rate(self) -> float:
        """Calculate transaction success rate"""
        if self.total_transactions == 0:
            return 0.0
        return (self.successful_transactions / self.total_transactions) * 100
    
    @property
    def transactions_per_second(self) -> float:
        """Calculate throughput (tx/s)"""
        if self.total_duration_sec == 0:
            return 0.0
        return self.successful_transactions / self.total_duration_sec
    
    @property
    def average_latency_ms(self) -> float:
        """Calculate average transaction latency"""
        if not self.transaction_durations_ms:
            return 0.0
        return sum(self.transaction_durations_ms) / len(self.transaction_durations_ms)
    
    @property
    def median_latency_ms(self) -> float:
        """Calculate median transaction latency"""
        if not self.transaction_durations_ms:
            return 0.0
        sorted_durations = sorted(self.transaction_durations_ms)
        n = len(sorted_durations)
        if n % 2 == 0:
            return (sorted_durations[n//2 - 1] + sorted_durations[n//2]) / 2
        return sorted_durations[n//2]


class CBDCSimulation:
    """
    OpenCBDC-Style Stablecoin Simulation
    
    Simulates a CBDC payment system with:
    - Central bank as token issuer
    - Commercial banks as intermediaries
    - Retail users making payments
    """
    
    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        num_users: int = 10,
        num_transactions: int = 100,
        initial_supply: float = 10_000_000,
        verbose: bool = False
    ):
        """
        Initialize the CBDC simulation
        
        Args:
            base_url: REST API base URL
            num_users: Number of retail user accounts to simulate
            num_transactions: Number of retail payment transactions
            initial_supply: Initial token supply to mint
            verbose: Enable verbose logging
        """
        self.base_url = base_url
        self.num_users = num_users
        self.num_transactions = num_transactions
        self.initial_supply = initial_supply
        
        # Configure logging
        if verbose:
            logger.setLevel(logging.DEBUG)
        else:
            logger.setLevel(logging.INFO)
        
        # Initialize client
        self.client = StablecoinClient(base_url)
        
        # Define accounts
        self.central_bank = "bank_central"
        self.commercial_banks = ["bank_a", "bank_b"]
        self.retail_users = [f"user_{i:03d}" for i in range(num_users)]
        
        # Metrics
        self.metrics = SimulationMetrics()
        
        logger.info("=" * 80)
        logger.info("OpenCBDC-Style Stablecoin Simulation Initialized")
        logger.info("=" * 80)
        logger.info(f"Central Bank: {self.central_bank}")
        logger.info(f"Commercial Banks: {', '.join(self.commercial_banks)}")
        logger.info(f"Retail Users: {num_users} accounts")
        logger.info(f"Planned Transactions: {num_transactions}")
        logger.info(f"Initial Supply: {initial_supply:,.0f} tokens")
        logger.info("=" * 80)
    
    def run(self) -> bool:
        """
        Execute the complete simulation
        
        Returns:
            True if simulation completed successfully
        """
        try:
            # Start metrics tracking
            self.client.start_metrics()
            
            # Step 0: Health check
            if not self._health_check():
                return False
            
            # Step 1: Initialize central bank
            if not self._initialize_central_bank():
                return False
            
            # Step 2: Distribute to commercial banks
            if not self._distribute_to_banks():
                return False
            
            # Step 3: Distribute to retail users
            if not self._distribute_to_users():
                return False
            
            # Step 4: Run retail payment simulation
            if not self._run_retail_payments():
                return False
            
            # Step 5: Print metrics and final state
            self._print_results()
            
            # Stop metrics tracking
            self.client.stop_metrics()
            
            return True
            
        except KeyboardInterrupt:
            logger.warning("\n\nSimulation interrupted by user")
            self._print_results()
            return False
            
        except Exception as e:
            logger.error(f"Simulation failed with error: {e}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            self.client.close()
    
    def _health_check(self) -> bool:
        """Check if API server is healthy"""
        logger.info("\n[Phase 0] Health Check")
        logger.info("-" * 80)
        
        if self.client.health_check():
            logger.info("✓ API server is healthy and ready")
            return True
        else:
            logger.error("✗ API server is not accessible")
            logger.error("Please ensure:")
            logger.error("  1. Fabric test-network is running")
            logger.error("  2. Stablecoin chaincode is deployed")
            logger.error("  3. REST API server is running on " + self.base_url)
            return False
    
    def _initialize_central_bank(self) -> bool:
        """Mint initial supply to central bank"""
        logger.info("\n[Phase 1] Initialize Central Bank")
        logger.info("-" * 80)
        logger.info(f"Minting {self.initial_supply:,.0f} tokens to {self.central_bank}...")
        
        start_time = time.time()
        result = self.client.mint(self.central_bank, self.initial_supply)
        duration = time.time() - start_time
        
        if result.success:
            logger.info(f"✓ Mint successful")
            logger.info(f"  New Balance: {result.data.get('newBalance', 0):,.0f}")
            logger.info(f"  Total Supply: {result.data.get('newTotalSupply', 0):,.0f}")
            logger.info(f"  Duration: {duration:.3f}s")
            
            # Verify balance
            balance_info = self.client.get_balance(self.central_bank)
            if balance_info:
                actual_balance = balance_info['balance']
                logger.info(f"  Verified Balance: {actual_balance:,.0f}")
                return True
            else:
                logger.error("✗ Failed to verify central bank balance")
                return False
        else:
            logger.error(f"✗ Mint failed: {result.error}")
            return False
    
    def _distribute_to_banks(self) -> bool:
        """Distribute tokens from central bank to commercial banks"""
        logger.info("\n[Phase 2] Distribute to Commercial Banks")
        logger.info("-" * 80)
        
        # Each commercial bank gets 30% of initial supply
        bank_allocation = self.initial_supply * 0.30
        
        for bank in self.commercial_banks:
            logger.info(f"Transferring {bank_allocation:,.0f} to {bank}...")
            
            result = self.client.transfer(self.central_bank, bank, bank_allocation)
            
            if result.success:
                logger.info(f"  ✓ Transfer successful")
                logger.info(f"    {bank} balance: {result.data.get('toBalance', 0):,.0f}")
            else:
                logger.error(f"  ✗ Transfer failed: {result.error}")
                return False
        
        # Verify central bank remaining balance
        balance_info = self.client.get_balance(self.central_bank)
        if balance_info:
            remaining = balance_info['balance']
            expected_remaining = self.initial_supply * 0.40  # Should have 40% left
            logger.info(f"\nCentral Bank Remaining: {remaining:,.0f} (expected ~{expected_remaining:,.0f})")
            return True
        else:
            logger.error("Failed to verify central bank balance")
            return False
    
    def _distribute_to_users(self) -> bool:
        """Distribute tokens from commercial banks to retail users"""
        logger.info("\n[Phase 3] Distribute to Retail Users")
        logger.info("-" * 80)
        logger.info(f"Distributing tokens to {self.num_users} retail users...")
        
        # Each user gets a random amount between 100-1000 tokens
        successful_distributions = 0
        
        for user in self.retail_users:
            # Randomly select a commercial bank
            bank = random.choice(self.commercial_banks)
            
            # Random initial balance for user
            user_balance = random.uniform(100, 1000)
            
            result = self.client.transfer(bank, user, user_balance)
            
            if result.success:
                successful_distributions += 1
                logger.debug(f"  ✓ {user}: {user_balance:.2f} (from {bank})")
            else:
                logger.warning(f"  ✗ Failed to distribute to {user}: {result.error}")
        
        logger.info(f"✓ Distributed to {successful_distributions}/{self.num_users} users")
        
        # Print bank balances after distribution
        logger.info("\nCommercial Bank Balances:")
        for bank in self.commercial_banks:
            balance_info = self.client.get_balance(bank)
            if balance_info:
                logger.info(f"  {bank}: {balance_info['balance']:,.2f}")
        
        return successful_distributions > 0
    
    def _run_retail_payments(self) -> bool:
        """Simulate retail payment transactions"""
        logger.info("\n[Phase 4] Retail Payments Simulation")
        logger.info("=" * 80)
        logger.info(f"Simulating {self.num_transactions} retail payment transactions...")
        logger.info(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("-" * 80)
        
        start_time = time.time()
        
        for i in range(self.num_transactions):
            # Random sender and receiver (must be different)
            sender = random.choice(self.retail_users)
            receiver = random.choice([u for u in self.retail_users if u != sender])
            
            # Random payment amount (1-50 tokens)
            amount = random.uniform(1, 50)
            
            # Execute transfer
            result = self.client.transfer(sender, receiver, amount)
            
            # Update metrics
            self.metrics.total_transactions += 1
            
            if result.success:
                self.metrics.successful_transactions += 1
                if result.duration_ms:
                    self.metrics.transaction_durations_ms.append(result.duration_ms)
                
                if (i + 1) % 10 == 0:
                    logger.info(f"  Progress: {i + 1}/{self.num_transactions} transactions "
                              f"({self.metrics.success_rate:.1f}% success rate)")
            else:
                self.metrics.failed_transactions += 1
                logger.warning(f"  Transaction {i + 1} failed: {result.error}")
            
            # Small delay to avoid overwhelming the system (optional)
            # time.sleep(0.01)
        
        end_time = time.time()
        self.metrics.total_duration_sec = end_time - start_time
        
        logger.info("-" * 80)
        logger.info(f"Completed {self.metrics.total_transactions} transactions in "
                   f"{self.metrics.total_duration_sec:.2f}s")
        logger.info(f"End time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 80)
        
        return True
    
    def _print_results(self):
        """Print simulation results and metrics"""
        logger.info("\n" + "=" * 80)
        logger.info("SIMULATION RESULTS")
        logger.info("=" * 80)
        
        # Transaction Metrics
        logger.info("\n📊 Transaction Metrics:")
        logger.info(f"  Total Transactions:      {self.metrics.total_transactions:,}")
        logger.info(f"  Successful:              {self.metrics.successful_transactions:,}")
        logger.info(f"  Failed:                  {self.metrics.failed_transactions:,}")
        logger.info(f"  Success Rate:            {self.metrics.success_rate:.2f}%")
        
        # Performance Metrics
        logger.info("\n⚡ Performance Metrics:")
        logger.info(f"  Total Duration:          {self.metrics.total_duration_sec:.3f}s")
        logger.info(f"  Throughput:              {self.metrics.transactions_per_second:.2f} tx/s")
        logger.info(f"  Average Latency:         {self.metrics.average_latency_ms:.2f}ms")
        logger.info(f"  Median Latency:          {self.metrics.median_latency_ms:.2f}ms")
        
        if self.metrics.transaction_durations_ms:
            min_latency = min(self.metrics.transaction_durations_ms)
            max_latency = max(self.metrics.transaction_durations_ms)
            logger.info(f"  Min Latency:             {min_latency:.2f}ms")
            logger.info(f"  Max Latency:             {max_latency:.2f}ms")
        
        # Account Balances
        logger.info("\n💰 Final Account Balances:")
        
        # Central Bank
        cb_balance = self.client.get_balance(self.central_bank)
        if cb_balance:
            logger.info(f"  {self.central_bank:20s} {cb_balance['balance']:>15,.2f}")
        
        # Commercial Banks
        total_bank_balances = 0
        for bank in self.commercial_banks:
            balance_info = self.client.get_balance(bank)
            if balance_info:
                logger.info(f"  {bank:20s} {balance_info['balance']:>15,.2f}")
                total_bank_balances += balance_info['balance']
        
        # Sample of user balances (first 5 users)
        logger.info(f"\n  Sample User Balances (first 5):")
        total_user_balances = 0
        for user in self.retail_users[:5]:
            balance_info = self.client.get_balance(user)
            if balance_info:
                logger.info(f"  {user:20s} {balance_info['balance']:>15,.2f}")
                total_user_balances += balance_info['balance']
        
        # Get all user balances for total calculation
        logger.info(f"\n  Calculating total user balances...")
        for user in self.retail_users[5:]:
            balance_info = self.client.get_balance(user)
            if balance_info:
                total_user_balances += balance_info['balance']
        
        # Total Supply
        logger.info("\n🪙 Total Supply:")
        total_supply = self.client.get_total_supply()
        if total_supply is not None:
            logger.info(f"  Total Supply:            {total_supply:,.2f}")
            logger.info(f"  Initial Supply:          {self.initial_supply:,.2f}")
            logger.info(f"  Difference:              {total_supply - self.initial_supply:,.2f}")
            
            # Verify conservation of tokens
            if cb_balance:
                calculated_total = cb_balance['balance'] + total_bank_balances + total_user_balances
                logger.info(f"\n✅ Token Conservation Check:")
                logger.info(f"  Central Bank:            {cb_balance['balance']:,.2f}")
                logger.info(f"  Commercial Banks:        {total_bank_balances:,.2f}")
                logger.info(f"  Retail Users:            {total_user_balances:,.2f}")
                logger.info(f"  Calculated Total:        {calculated_total:,.2f}")
                logger.info(f"  Blockchain Total Supply: {total_supply:,.2f}")
                
                if abs(calculated_total - total_supply) < 0.01:
                    logger.info(f"  ✓ Balances match! Token conservation verified.")
                else:
                    logger.warning(f"  ⚠ Mismatch detected (difference: {abs(calculated_total - total_supply):.2f})")
        
        logger.info("\n" + "=" * 80)
        logger.info("Simulation completed successfully!")
        logger.info("=" * 80 + "\n")


def main():
    """Main entry point for the simulation"""
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description='OpenCBDC-Style Stablecoin Simulation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with defaults
  python run_simulation.py
  
  # Run with 500 transactions and 20 users
  python run_simulation.py --num-transactions 500 --num-users 20
  
  # Run with verbose logging
  python run_simulation.py --verbose
  
  # Run with custom API URL
  python run_simulation.py --api-url http://localhost:8000
        """
    )
    
    parser.add_argument(
        '--api-url',
        type=str,
        default='http://localhost:3000',
        help='REST API base URL (default: http://localhost:3000)'
    )
    
    parser.add_argument(
        '--num-users',
        type=int,
        default=10,
        help='Number of retail user accounts (default: 10)'
    )
    
    parser.add_argument(
        '--num-transactions',
        type=int,
        default=100,
        help='Number of retail payment transactions (default: 100)'
    )
    
    parser.add_argument(
        '--initial-supply',
        type=float,
        default=10_000_000,
        help='Initial token supply (default: 10,000,000)'
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    # Print banner
    print("\n" + "=" * 80)
    print("  OpenCBDC-Style Stablecoin Simulation on Hyperledger Fabric")
    print("=" * 80)
    print(f"  API URL:              {args.api_url}")
    print(f"  Retail Users:         {args.num_users}")
    print(f"  Transactions:         {args.num_transactions}")
    print(f"  Initial Supply:       {args.initial_supply:,.0f}")
    print(f"  Verbose Logging:      {args.verbose}")
    print("=" * 80 + "\n")
    
    # Create and run simulation
    simulation = CBDCSimulation(
        base_url=args.api_url,
        num_users=args.num_users,
        num_transactions=args.num_transactions,
        initial_supply=args.initial_supply,
        verbose=args.verbose
    )
    
    success = simulation.run()
    
    # Display client-level metrics from StablecoinClient
    print("\n" + "=" * 80)
    print("  CLIENT TRANSACTION METRICS")
    print("=" * 80)
    client_metrics = simulation.client.get_metrics()
    print(f"  Total Transactions:       {client_metrics['total_transactions']}")
    print(f"  Successful:               {client_metrics['successful_transactions']}")
    print(f"  Failed:                   {client_metrics['failed_transactions']}")
    print(f"  Success Rate:             {client_metrics['success_rate']}")
    print(f"  Duration:                 {client_metrics['duration_seconds']}s")
    print(f"  Throughput:               {client_metrics['transactions_per_second']} tx/s")
    print("=" * 80 + "\n")
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
