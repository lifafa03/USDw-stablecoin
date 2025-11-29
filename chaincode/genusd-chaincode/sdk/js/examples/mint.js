/**
 * Example: Mint GENUSD Stablecoins
 * 
 * This example demonstrates how to mint new stablecoins using the GENUSD SDK.
 * Minting is restricted to authorized issuers with Dilithium signatures.
 */

const { createClient } = require('@genusd/sdk');

async function main() {
  // Initialize SDK client
  const client = createClient({
    apiUrl: 'http://localhost:3000/api/v1',
    apiKey: 'your_api_key_here',
    enableMockSignatures: true, // Set to false in production
  });

  console.log('🪙 GENUSD Mint Example\n');

  // Define mint request
  const mintRequest = {
    outputs: [
      {
        owner_id: 'user_alice',
        amount: 1000000, // $10,000 (6 decimals)
        asset_code: 'GENUSD',
        kyc_tag: 'KYC_LEVEL_3',
      },
      {
        owner_id: 'user_bob',
        amount: 500000, // $5,000
        asset_code: 'GENUSD',
        kyc_tag: 'KYC_LEVEL_2',
      },
    ],
    issuer_id: 'issuer_central_bank',
    dilithium_signature: '', // Will be auto-generated if mock enabled
  };

  console.log('📝 Mint Request:');
  console.log(JSON.stringify(mintRequest, null, 2));
  console.log('');

  // Execute mint transaction
  console.log('⏳ Submitting mint transaction...');
  const result = await client.mint(mintRequest);

  if (result.success) {
    console.log('✅ Mint successful!');
    console.log(`Transaction ID: ${result.tx_id}`);
    console.log(`Created UTXOs: ${result.data?.utxo_ids?.join(', ')}`);
    console.log('');

    // Query balance for Alice
    console.log('💰 Querying Alice\'s balance...');
    const balanceResult = await client.getBalance('user_alice');
    
    if (balanceResult.success) {
      console.log(`Alice's balance: $${(balanceResult.data?.balance / 100).toFixed(2)}`);
      console.log(`Active UTXOs: ${balanceResult.data?.utxos?.length}`);
    }
  } else {
    console.error('❌ Mint failed:', result.error);
  }
}

main().catch(console.error);
