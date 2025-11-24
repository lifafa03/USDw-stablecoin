"""
OpenCBDC-Style Stablecoin Simulation Runner (CLI Version)

This version uses peer CLI commands directly instead of REST API
to bypass SDK connection issues while still demonstrating the
CBDC simulation scenario.

Usage:
    python3 run_simulation_cli.py
"""

import subprocess
import json
import time
import random
from typing import Dict, Optional, List
from dataclasses import dataclass, field

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
        if self.total_transactions == 0:
            return 0.0
        return (self.successful_transactions / self.total_transactions) * 100
    
    @property
    def transactions_per_second(self) -> float:
        if self.total_duration_sec == 0:
            return 0.0
        return self.successful_transactions / self.total_duration_sec
    
    @property
    def average_latency_ms(self) -> float:
        if not self.transaction_durations_ms:
            return 0.0
        return sum(self.transaction_durations_ms) / len(self.transaction_durations_ms)


class PeerCLIClient:
    """Client that uses peer CLI commands directly"""
    
    def __init__(self):
        self.test_network_path = "/home/rsolipuram/stablecoin-fabric/fabric-samples/test-network"
        self.env = self._setup_environment()
    
    def _setup_environment(self) -> Dict[str, str]:
        """Setup environment variables for peer CLI"""
        env = {
            'PATH': f"{self.test_network_path}/../bin:/usr/local/bin:/usr/bin:/bin",
            'FABRIC_CFG_PATH': f"{self.test_network_path}/../config/",
            'CORE_PEER_TLS_ENABLED': 'true',
            'CORE_PEER_LOCALMSPID': 'Org1MSP',
            'CORE_PEER_TLS_ROOTCERT_FILE': f"{self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt",
            'CORE_PEER_MSPCONFIGPATH': f"{self.test_network_path}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp",
            'CORE_PEER_ADDRESS': 'localhost:7051',
        }
        return env
    
    def _run_peer_command(self, args: List[str], timeout: int = 30) -> Optional[Dict]:
        """Run a peer chaincode command"""
        try:
            start_time = time.time()
            result = subprocess.run(
                args,
                env=self.env,
                cwd=self.test_network_path,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            duration_ms = (time.time() - start_time) * 1000
            
            if result.returncode == 0:
                # Parse the output to extract the payload
                output = result.stdout
                if 'payload:' in output.lower():
                    # Extract JSON payload from output
                    lines = output.split('\n')
                    for line in lines:
                        if line.strip().startswith('{'):
                            try:
                                return {'success': True, 'data': json.loads(line.strip()), 'duration_ms': duration_ms}
                            except json.JSONDecodeError:
                                pass
                return {'success': True, 'data': {}, 'duration_ms': duration_ms}
            else:
                return {'success': False, 'error': result.stderr, 'duration_ms': duration_ms}
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Command timeout'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def mint(self, account_id: str, amount: float) -> Dict:
        """Mint tokens using peer CLI"""
        args = [
            'peer', 'chaincode', 'invoke',
            '-o', 'localhost:7050',
            '--ordererTLSHostnameOverride', 'orderer.example.com',
            '--tls',
            '--cafile', f"{self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem",
            '-C', 'mychannel',
            '-n', 'stablecoin',
            '--peerAddresses', 'localhost:7051',
            '--tlsRootCertFiles', f"{self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt",
            '--peerAddresses', 'localhost:9051',
            '--tlsRootCertFiles', f"{self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt",
            '-c', json.dumps({"function": "Mint", "Args": [account_id, str(int(amount))]})
        ]
        return self._run_peer_command(args)
    
    def transfer(self, from_account: str, to_account: str, amount: float) -> Dict:
        """Transfer tokens using peer CLI"""
        args = [
            'peer', 'chaincode', 'invoke',
            '-o', 'localhost:7050',
            '--ordererTLSHostnameOverride', 'orderer.example.com',
            '--tls',
            '--cafile', f"{self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem",
            '-C', 'mychannel',
            '-n', 'stablecoin',
            '--peerAddresses', 'localhost:7051',
            '--tlsRootCertFiles', f"{self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt",
            '--peerAddresses', 'localhost:9051',
            '--tlsRootCertFiles', f"{self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt",
            '-c', json.dumps({"function": "Transfer", "Args": [from_account, to_account, str(int(amount))]})
        ]
        return self._run_peer_command(args)
    
    def get_balance(self, account_id: str) -> Optional[float]:
        """Query balance using peer CLI"""
        args = [
            'peer', 'chaincode', 'query',
            '-C', 'mychannel',
            '-n', 'stablecoin',
            '-c', json.dumps({"function": "BalanceOf", "Args": [account_id]})
        ]
        result = self._run_peer_command(args, timeout=10)
        if result and result.get('success'):
            data = result.get('data', {})
            return data.get('balance', 0)
        return None
    
    def get_total_supply(self) -> Optional[float]:
        """Query total supply using peer CLI"""
        args = [
            'peer', 'chaincode', 'query',
            '-C', 'mychannel',
            '-n', 'stablecoin',
            '-c', json.dumps({"function": "TotalSupply", "Args": []})
        ]
        result = self._run_peer_command(args, timeout=10)
        if result and result.get('success'):
            data = result.get('data', {})
            return data.get('totalSupply', 0)
        return None


def print_section(title: str):
    """Print a formatted section header"""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def print_subsection(title: str):
    """Print a formatted subsection header"""
    print("\n" + "-" * 80)
    print(f"  {title}")
    print("-" * 80)


def main():
    """Run the simulation"""
    print_section("OpenCBDC-Style Stablecoin Simulation (CLI Version)")
    print("  Using Peer CLI commands for direct blockchain interaction")
    print("  This bypasses REST API to demonstrate core functionality")
    
    # Configuration
    num_users = 10
    num_transactions = 50  # Reduced for CLI performance
    initial_supply = 10_000_000
    
    print(f"\n  Configuration:")
    print(f"    Initial Supply:  {initial_supply:,}")
    print(f"    Retail Users:    {num_users}")
    print(f"    Transactions:    {num_transactions}")
    
    # Initialize client
    client = PeerCLIClient()
    metrics = SimulationMetrics()
    
    # Define accounts
    central_bank = "bank_central"
    commercial_banks = ["bank_a", "bank_b"]
    retail_users = [f"user_{i:03d}" for i in range(num_users)]
    
    # Phase 1: Initialize Central Bank
    print_subsection("Phase 1: Initialize Central Bank")
    print(f"  Minting {initial_supply:,} tokens to {central_bank}...")
    
    result = client.mint(central_bank, initial_supply)
    if result.get('success'):
        print(f"  ✓ Mint successful ({result.get('duration_ms', 0):.0f}ms)")
        balance = client.get_balance(central_bank)
        if balance is not None:
            print(f"  ✓ Verified balance: {balance:,.0f}")
    else:
        print(f"  ✗ Mint failed: {result.get('error', 'Unknown error')}")
        return
    
    # Phase 2: Distribute to Commercial Banks
    print_subsection("Phase 2: Distribute to Commercial Banks")
    bank_allocation = initial_supply * 0.30
    
    for bank in commercial_banks:
        print(f"  Transferring {bank_allocation:,.0f} to {bank}...")
        result = client.transfer(central_bank, bank, bank_allocation)
        if result.get('success'):
            print(f"    ✓ Transfer successful ({result.get('duration_ms', 0):.0f}ms)")
        else:
            print(f"    ✗ Transfer failed: {result.get('error', 'Unknown')}")
    
    # Verify bank balances
    print("\n  Commercial Bank Balances:")
    for bank in commercial_banks:
        balance = client.get_balance(bank)
        if balance is not None:
            print(f"    {bank}: {balance:,.2f}")
    
    # Phase 3: Distribute to Retail Users
    print_subsection("Phase 3: Distribute to Retail Users")
    print(f"  Distributing tokens to {num_users} retail users...")
    
    successful_distributions = 0
    for i, user in enumerate(retail_users):
        bank = random.choice(commercial_banks)
        user_balance = random.uniform(100, 1000)
        
        result = client.transfer(bank, user, user_balance)
        if result.get('success'):
            successful_distributions += 1
            if (i + 1) % 5 == 0:
                print(f"    Progress: {i + 1}/{num_users} users")
    
    print(f"  ✓ Distributed to {successful_distributions}/{num_users} users")
    
    # Phase 4: Retail Payments Simulation
    print_subsection("Phase 4: Retail Payments Simulation")
    print(f"  Simulating {num_transactions} retail payment transactions...")
    
    start_time = time.time()
    
    for i in range(num_transactions):
        sender = random.choice(retail_users)
        receiver = random.choice([u for u in retail_users if u != sender])
        amount = random.uniform(1, 50)
        
        result = client.transfer(sender, receiver, amount)
        
        metrics.total_transactions += 1
        
        if result.get('success'):
            metrics.successful_transactions += 1
            if result.get('duration_ms'):
                metrics.transaction_durations_ms.append(result['duration_ms'])
            
            if (i + 1) % 10 == 0:
                print(f"    Progress: {i + 1}/{num_transactions} ({metrics.success_rate:.1f}% success)")
        else:
            metrics.failed_transactions += 1
    
    metrics.total_duration_sec = time.time() - start_time
    
    # Results
    print_section("SIMULATION RESULTS")
    
    print("\n📊 Transaction Metrics:")
    print(f"  Total Transactions:      {metrics.total_transactions:,}")
    print(f"  Successful:              {metrics.successful_transactions:,}")
    print(f"  Failed:                  {metrics.failed_transactions:,}")
    print(f"  Success Rate:            {metrics.success_rate:.2f}%")
    
    print("\n⚡ Performance Metrics:")
    print(f"  Total Duration:          {metrics.total_duration_sec:.3f}s")
    print(f"  Throughput:              {metrics.transactions_per_second:.2f} tx/s")
    print(f"  Average Latency:         {metrics.average_latency_ms:.2f}ms")
    
    print("\n💰 Final Account Balances:")
    
    cb_balance = client.get_balance(central_bank)
    if cb_balance is not None:
        print(f"  {central_bank:20s} {cb_balance:>15,.2f}")
    
    total_bank_balances = 0
    for bank in commercial_banks:
        balance = client.get_balance(bank)
        if balance is not None:
            print(f"  {bank:20s} {balance:>15,.2f}")
            total_bank_balances += balance
    
    print(f"\n  Sample User Balances (first 5):")
    total_user_balances = 0
    for user in retail_users[:5]:
        balance = client.get_balance(user)
        if balance is not None:
            print(f"  {user:20s} {balance:>15,.2f}")
            total_user_balances += balance
    
    # Get remaining user balances
    for user in retail_users[5:]:
        balance = client.get_balance(user)
        if balance is not None:
            total_user_balances += balance
    
    print("\n🪙 Total Supply:")
    total_supply = client.get_total_supply()
    if total_supply is not None:
        print(f"  Total Supply:            {total_supply:,.2f}")
        print(f"  Initial Supply:          {initial_supply:,.2f}")
        
        if cb_balance is not None:
            calculated_total = cb_balance + total_bank_balances + total_user_balances
            print(f"\n✅ Token Conservation Check:")
            print(f"  Central Bank:            {cb_balance:,.2f}")
            print(f"  Commercial Banks:        {total_bank_balances:,.2f}")
            print(f"  Retail Users:            {total_user_balances:,.2f}")
            print(f"  Calculated Total:        {calculated_total:,.2f}")
            print(f"  Blockchain Total Supply: {total_supply:,.2f}")
            
            if abs(calculated_total - total_supply) < 0.01:
                print(f"  ✓ Balances match! Token conservation verified.")
            else:
                print(f"  ⚠ Mismatch: {abs(calculated_total - total_supply):.2f}")
    
    print("\n" + "=" * 80)
    print("Simulation completed successfully!")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
