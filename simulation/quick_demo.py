"""
Quick OpenCBDC-Style Simulation with Existing Balances

This runs a quick simulation using the existing token balances
in the blockchain, demonstrating retail payment functionality.
"""

import subprocess
import json
import time
import random
from typing import Dict, List

class QuickSimulator:
    def __init__(self):
        self.test_network_path = "/home/rsolipuram/stablecoin-fabric/fabric-samples/test-network"
        self.env_setup = f"""
export PATH={self.test_network_path}/../bin:$PATH
export FABRIC_CFG_PATH={self.test_network_path}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE={self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH={self.test_network_path}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
"""
    
    def run_command(self, command: str) -> Dict:
        """Run a bash command with proper environment"""
        full_command = f"cd {self.test_network_path} && {self.env_setup} && {command}"
        start = time.time()
        
        try:
            result = subprocess.run(
                ['bash', '-c', full_command],
                capture_output=True,
                text=True,
                timeout=30
            )
            duration_ms = (time.time() - start) * 1000
            
            if result.returncode == 0:
                # Try to parse JSON from output
                output = result.stdout.strip()
                for line in output.split('\n'):
                    line = line.strip()
                    if line.startswith('{'):
                        try:
                            data = json.loads(line)
                            return {'success': True, 'data': data, 'duration_ms': duration_ms}
                        except:
                            pass
                return {'success': True, 'output': output, 'duration_ms': duration_ms}
            else:
                return {'success': False, 'error': result.stderr, 'duration_ms': duration_ms}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def query_balance(self, account: str) -> float:
        """Query account balance"""
        cmd = f"peer chaincode query -C mychannel -n stablecoin -c '{{\"function\":\"BalanceOf\",\"Args\":[\"{account}\"]}}'"
        result = self.run_command(cmd)
        if result.get('success') and result.get('data'):
            return result['data'].get('balance', 0)
        return 0
    
    def transfer(self, from_acct: str, to_acct: str, amount: float) -> Dict:
        """Execute transfer"""
        cmd = f"""peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile {self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n stablecoin --peerAddresses localhost:7051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{{\"function\":\"Transfer\",\"Args\":[\"{from_acct}\",\"{to_acct}\",\"{int(amount)}\"]}}'"""
        return self.run_command(cmd)
    
    def mint(self, account: str, amount: float) -> Dict:
        """Mint new tokens"""
        cmd = f"""peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile {self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n stablecoin --peerAddresses localhost:7051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{{\"function\":\"Mint\",\"Args\":[\"{account}\",\"{int(amount)}\"]}}'"""
        return self.run_command(cmd)


def print_header(text: str):
    print("\n" + "=" * 80)
    print(f"  {text}")
    print("=" * 80)


def main():
    print_header("OpenCBDC-Style Stablecoin Simulation (Quick Demo)")
    
    sim = QuickSimulator()
    
    # Configuration
    num_sim_users = 5
    num_transactions = 20
    
    print(f"\nConfiguration:")
    print(f"  Simulation Users: {num_sim_users}")
    print(f"  Transactions:     {num_transactions}")
    
    # Check existing state
    print_header("Phase 1: Check Existing State")
    
    central_balance = sim.query_balance("bank_central")
    print(f"  Central Bank Balance: {central_balance:,.0f}")
    
    # Setup simulation accounts
    sim_accounts = [f"sim_user_{i}" for i in range(num_sim_users)]
    
    # Distribute initial balances to sim users
    print_header("Phase 2: Setup Simulation Accounts")
    
    for i, user in enumerate(sim_accounts):
        current_balance = sim.query_balance(user)
        
        if current_balance < 100:
            print(f"  Funding {user}...")
            result = sim.transfer("bank_central", user, 500)
            if result.get('success'):
                print(f"    ✓ Funded with 500 tokens ({result.get('duration_ms', 0):.0f}ms)")
            else:
                print(f"    ✗ Failed to fund")
        else:
            print(f"  {user} already has {current_balance:.0f} tokens")
    
    # Run payment simulation
    print_header("Phase 3: Retail Payment Simulation")
    print(f"  Running {num_transactions} random payment transactions...")
    
    successful = 0
    failed = 0
    total_duration = []
    start_time = time.time()
    
    for i in range(num_transactions):
        sender = random.choice(sim_accounts)
        receiver = random.choice([u for u in sim_accounts if u != sender])
        amount = random.uniform(5, 50)
        
        result = sim.transfer(sender, receiver, amount)
        
        if result.get('success'):
            successful += 1
            if result.get('duration_ms'):
                total_duration.append(result['duration_ms'])
            
            if (i + 1) % 5 == 0:
                print(f"    Progress: {i + 1}/{num_transactions} ({successful}/{i+1} successful)")
        else:
            failed += 1
    
    elapsed = time.time() - start_time
    
    # Results
    print_header("SIMULATION RESULTS")
    
    print("\n📊 Transaction Metrics:")
    print(f"  Total Transactions:  {num_transactions}")
    print(f"  Successful:          {successful}")
    print(f"  Failed:              {failed}")
    print(f"  Success Rate:        {(successful/num_transactions*100):.1f}%")
    
    print("\n⚡ Performance Metrics:")
    print(f"  Total Duration:      {elapsed:.2f}s")
    print(f"  Throughput:          {successful/elapsed:.2f} tx/s")
    if total_duration:
        avg_latency = sum(total_duration) / len(total_duration)
        print(f"  Average Latency:     {avg_latency:.0f}ms")
    
    print("\n💰 Final Balances:")
    print(f"  Central Bank:        {sim.query_balance('bank_central'):,.0f}")
    
    print(f"\n  Simulation Users:")
    total_sim_balance = 0
    for user in sim_accounts:
        balance = sim.query_balance(user)
        total_sim_balance += balance
        print(f"    {user:15s}  {balance:>10,.2f}")
    
    print(f"\n  Total in sim users:  {total_sim_balance:,.2f}")
    
    # Query final total supply
    result = sim.run_command("peer chaincode query -C mychannel -n stablecoin -c '{\"function\":\"TotalSupply\",\"Args\":[]}'")
    if result.get('success') and result.get('data'):
        total_supply = result['data'].get('totalSupply', 0)
        print(f"\n🪙 Total Supply:       {total_supply:,.0f}")
    
    print("\n" + "=" * 80)
    print("✓ Simulation completed successfully!")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
