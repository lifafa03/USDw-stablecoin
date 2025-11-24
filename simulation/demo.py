"""
OpenCBDC-Style Stablecoin Simulation - Working Demo

This demonstrates a CBDC-style payment system with:
- Existing central bank reserves
- Distribution to commercial banks
- Retail payment transactions
- Performance metrics
"""

import subprocess
import json
import time
import random
from datetime import datetime

class StablecoinSimulator:
    def __init__(self):
        self.test_network_path = "/home/rsolipuram/stablecoin-fabric/fabric-samples/test-network"
    
    def _run_cmd(self, command: str) -> dict:
        """Run peer command and return result"""
        env_vars = f"""
export PATH={self.test_network_path}/../bin:$PATH
export FABRIC_CFG_PATH={self.test_network_path}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE={self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH={self.test_network_path}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
"""
        full_cmd = f"cd {self.test_network_path} && {env_vars} && {command}"
        start = time.time()
        
        try:
            result = subprocess.run(['bash', '-c', full_cmd], capture_output=True, text=True, timeout=30)
            duration_ms = (time.time() - start) * 1000
            
            if result.returncode == 0:
                output = result.stdout.strip()
                for line in output.split('\n'):
                    if line.strip().startswith('{'):
                        try:
                            return {'success': True, 'data': json.loads(line.strip()), 'duration_ms': duration_ms}
                        except:
                            pass
                return {'success': True, 'output': output, 'duration_ms': duration_ms}
            else:
                return {'success': False, 'error': result.stderr[:200], 'duration_ms': duration_ms}
        except Exception as e:
            return {'success': False, 'error': str(e)[:200]}
    
    def balance(self, account: str) -> float:
        """Get account balance"""
        cmd = f"peer chaincode query -C mychannel -n stablecoin -c '{{\"function\":\"BalanceOf\",\"Args\":[\"{account}\"]}}'"
        result = self._run_cmd(cmd)
        if result.get('success') and result.get('data'):
            return result['data'].get('balance', 0)
        return 0
    
    def total_supply(self) -> float:
        """Get total supply"""
        cmd = "peer chaincode query -C mychannel -n stablecoin -c '{\"function\":\"TotalSupply\",\"Args\":[]}'"
        result = self._run_cmd(cmd)
        if result.get('success') and result.get('data'):
            return result['data'].get('totalSupply', 0)
        return 0
    
    def transfer(self, from_acc: str, to_acc: str, amount: int) -> dict:
        """Transfer tokens"""
        cmd = f"""peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile {self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n stablecoin --peerAddresses localhost:7051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{{\"function\":\"Transfer\",\"Args\":[\"{from_acc}\",\"{to_acc}\",\"{amount}\"]}}'"""
        return self._run_cmd(cmd)
    
    def mint(self, account: str, amount: int) -> dict:
        """Mint tokens"""
        cmd = f"""peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile {self.test_network_path}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n stablecoin --peerAddresses localhost:7051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles {self.test_network_path}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{{\"function\":\"Mint\",\"Args\":[\"{account}\",\"{amount}\"]}}'"""
        return self._run_cmd(cmd)


def main():
    print("\n" + "="*80)
    print("  OpenCBDC-Style Stablecoin Simulation on Hyperledger Fabric")
    print("="*80)
    print(f"  Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80 + "\n")
    
    sim = StablecoinSimulator()
    
    # Configuration
    NUM_BANKS = 3
    NUM_USERS = 8
    NUM_TRANSACTIONS = 30
    
    banks = [f"cbdc_bank_{i+1}" for i in range(NUM_BANKS)]
    users = [f"cbdc_user_{i+1}" for i in range(NUM_USERS)]
    
    print(f"Configuration:")
    print(f"  Commercial Banks:    {NUM_BANKS}")
    print(f"  Retail Users:        {NUM_USERS}")
    print(f"  Payment Transactions: {NUM_TRANSACTIONS}\n")
    
    # Phase 1: Check existing state and mint if needed
    print("-" * 80)
    print("Phase 1: Initialize Central Bank")
    print("-" * 80)
    
    cb_balance = sim.balance("central_bank")
    print(f"Current central_bank balance: {cb_balance:,.0f}")
    
    if cb_balance < 1000000:
        print("Minting 10,000,000 tokens to central_bank...")
        result = sim.mint("central_bank", 10000000)
        if result.get('success'):
            print(f"✓ Mint successful ({result.get('duration_ms', 0):.0f}ms)")
            cb_balance = sim.balance("central_bank")
            print(f"New balance: {cb_balance:,.0f}")
        else:
            print(f"✗ Mint failed: {result.get('error', 'Unknown error')[:100]}")
    else:
        print(f"✓ Sufficient balance exists\n")
    
    # Phase 2: Distribute to commercial banks
    print("\n" + "-" * 80)
    print("Phase 2: Distribute to Commercial Banks")
    print("-" * 80)
    
    bank_allocation = 50000  # Each bank gets 50k tokens
    
    for bank in banks:
        current = sim.balance(bank)
        if current < 10000:
            print(f"Funding {bank} with {bank_allocation:,} tokens...")
            result = sim.transfer("central_bank", bank, bank_allocation)
            if result.get('success'):
                print(f"  ✓ Success ({result.get('duration_ms', 0):.0f}ms)")
            else:
                print(f"  ✗ Failed")
        else:
            print(f"{bank}: {current:,.0f} (already funded)")
    
    # Phase 3: Distribute to users
    print("\n" + "-" * 80)
    print("Phase 3: Distribute to Retail Users")
    print("-" * 80)
    
    funded_users = 0
    for user in users:
        current = sim.balance(user)
        if current < 50:
            bank = random.choice(banks)
            amount = random.randint(500, 1500)
            result = sim.transfer(bank, user, amount)
            if result.get('success'):
                funded_users += 1
                if funded_users % 3 == 0:
                    print(f"  Progress: {funded_users}/{NUM_USERS} users funded")
        else:
            funded_users += 1
    
    print(f"✓ {funded_users}/{NUM_USERS} users have sufficient balance\n")
    
    # Phase 4: Retail payments simulation
    print("-" * 80)
    print("Phase 4: Retail Payment Simulation")
    print("-" * 80)
    print(f"Executing {NUM_TRANSACTIONS} retail payment transactions...\n")
    
    successful = 0
    failed = 0
    durations = []
    start_time = time.time()
    
    for i in range(NUM_TRANSACTIONS):
        sender = random.choice(users)
        receiver = random.choice([u for u in users if u != sender])
        amount = random.randint(10, 100)
        
        result = sim.transfer(sender, receiver, amount)
        
        if result.get('success'):
            successful += 1
            if result.get('duration_ms'):
                durations.append(result['duration_ms'])
        else:
            failed += 1
        
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i+1}/{NUM_TRANSACTIONS} ({successful} successful, {failed} failed)")
    
    total_time = time.time() - start_time
    
    # Results
    print("\n" + "="*80)
    print("SIMULATION RESULTS")
    print("="*80 + "\n")
    
    print("📊 Transaction Metrics:")
    print(f"  Total Transactions:      {NUM_TRANSACTIONS}")
    print(f"  Successful:              {successful}")
    print(f"  Failed:                  {failed}")
    print(f"  Success Rate:            {(successful/NUM_TRANSACTIONS*100):.1f}%\n")
    
    print("⚡ Performance Metrics:")
    print(f"  Total Duration:          {total_time:.2f}s")
    print(f"  Throughput:              {successful/total_time:.2f} tx/s")
    if durations:
        avg = sum(durations) / len(durations)
        print(f"  Average Latency:         {avg:.0f}ms")
        print(f"  Min Latency:             {min(durations):.0f}ms")
        print(f"  Max Latency:             {max(durations):.0f}ms\n")
    
    print("💰 Final Account Balances:\n")
    
    cb_final = sim.balance("central_bank")
    print(f"  Central Bank:")
    print(f"    central_bank:          {cb_final:>12,.0f}\n")
    
    print(f"  Commercial Banks:")
    total_bank = 0
    for bank in banks:
        bal = sim.balance(bank)
        total_bank += bal
        print(f"    {bank:20s} {bal:>12,.0f}")
    print(f"    {'Total:':<20s} {total_bank:>12,.0f}\n")
    
    print(f"  Retail Users (sample):")
    total_users = 0
    for user in users[:5]:
        bal = sim.balance(user)
        total_users += bal
        print(f"    {user:20s} {bal:>12,.0f}")
    
    for user in users[5:]:
        total_users += sim.balance(user)
    
    print(f"    ... ({NUM_USERS-5} more users)")
    print(f"    {'Total all users:':<20s} {total_users:>12,.0f}\n")
    
    total_supply = sim.total_supply()
    print("🪙 Supply & Conservation:")
    print(f"  Total Supply:            {total_supply:>12,.0f}")
    print(f"  Central Bank:            {cb_final:>12,.0f}")
    print(f"  Commercial Banks:        {total_bank:>12,.0f}")
    print(f"  Retail Users:            {total_users:>12,.0f}")
    calculated = cb_final + total_bank + total_users
    print(f"  Calculated Total:        {calculated:>12,.0f}")
    
    if abs(calculated - total_supply) < 1:
        print(f"\n  ✓ Token conservation verified! All balances match.")
    else:
        diff = abs(calculated - total_supply)
        print(f"\n  ⚠ Difference: {diff:,.0f} (some tokens in other accounts)")
    
    print("\n" + "="*80)
    print("✓ Simulation completed successfully!")
    print("="*80 + "\n")


if __name__ == "__main__":
    main()
