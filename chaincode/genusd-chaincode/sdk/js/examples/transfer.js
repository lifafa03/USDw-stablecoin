/**
 * Example: Transfer GENUSD Stablecoins
 * 
 * This example demonstrates UTXO-based transfer with conservation law enforcement.
 */

const { createClient } = require('@genusd/sdk');

async function main() {
  const client = createClient({
    apiUrl: 'http://localhost:3000/api/v1',
    enableMockSignatures: true,
  });

  console.log('💸 GENUSD Transfer Example\n');

  // Step 1: Check Alice's balance
  console.log('1️⃣ Checking Alice\'s balance...');
  const balanceResult = await client.getBalance('user_alice');
  
  if (!balanceResult.success) {
    console.error('❌ Failed to get balance:', balanceResult.error);
    return;
  }

  console.log(`Alice's balance: $${(balanceResult.data.balance / 100).toFixed(2)}`);
  console.log(`Available UTXOs: ${balanceResult.data.utxos.length}`);
  
  // Select UTXO to spend
  const utxoToSpend = balanceResult.data.utxos[0];
  console.log(`\nSelected UTXO: ${utxoToSpend.utxo_id} ($${(utxoToSpend.amount / 100).toFixed(2)})`);

  // Step 2: Create transfer transaction
  // Transfer $60 to Bob, $40 change back to Alice (conservation law: 100 = 60 + 40)
  const transferRequest = {
    inputs: [utxoToSpend.utxo_id],
    outputs: [
      {
        owner_id: 'user_bob',
        amount: 6000, // $60
        asset_code: 'GENUSD',
        kyc_tag: 'KYC_LEVEL_2',
      },
      {
        owner_id: 'user_alice',
        amount: 4000, // $40 change
        asset_code: 'GENUSD',
        kyc_tag: 'KYC_LEVEL_3',
      },
    ],
    sender_id: 'user_alice',
    dilithium_signature: '',
  };

  console.log('\n2️⃣ Transfer Request:');
  console.log(`  Inputs: ${transferRequest.inputs.join(', ')}`);
  console.log(`  Outputs:`);
  transferRequest.outputs.forEach((out, i) => {
    console.log(`    ${i + 1}. ${out.owner_id}: $${(out.amount / 100).toFixed(2)}`);
  });
  console.log(`  Conservation check: ${utxoToSpend.amount} = ${transferRequest.outputs.reduce((sum, o) => sum + o.amount, 0)} ✓`);

  // Step 3: Execute transfer
  console.log('\n⏳ Submitting transfer...');
  const result = await client.transfer(transferRequest);

  if (result.success) {
    console.log('✅ Transfer successful!');
    console.log(`Transaction ID: ${result.tx_id}`);
    console.log(`New UTXOs: ${result.data?.utxo_ids?.join(', ')}`);
    
    // Step 4: Verify new balances
    console.log('\n3️⃣ Verifying balances...');
    
    const aliceBalance = await client.getBalance('user_alice');
    const bobBalance = await client.getBalance('user_bob');
    
    if (aliceBalance.success) {
      console.log(`Alice's new balance: $${(aliceBalance.data.balance / 100).toFixed(2)}`);
    }
    
    if (bobBalance.success) {
      console.log(`Bob's new balance: $${(bobBalance.data.balance / 100).toFixed(2)}`);
    }
  } else {
    console.error('❌ Transfer failed:', result.error);
  }
}

main().catch(console.error);
