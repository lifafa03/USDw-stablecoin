/**
 * Example: Governance - Freeze Account
 * 
 * Demonstrates how compliance officers can freeze suspicious accounts.
 */

const { createClient } = require('@genusd/sdk');

async function main() {
  const client = createClient({
    apiUrl: 'http://localhost:3000/api/v1',
    enableMockSignatures: true,
  });

  console.log('🔒 GENUSD Governance - Freeze Account Example\n');

  // Governance action: Freeze suspicious account
  const freezeRequest = {
    action: 'freeze',
    target_user: 'user_suspicious',
    reason: 'AML alert triggered - suspicious transaction pattern detected',
    admin_id: 'compliance_officer_001',
    dilithium_signature: '',
  };

  console.log('📝 Freeze Request:');
  console.log(`  Target: ${freezeRequest.target_user}`);
  console.log(`  Reason: ${freezeRequest.reason}`);
  console.log(`  Admin: ${freezeRequest.admin_id}`);
  console.log('');

  // Execute freeze
  console.log('⏳ Submitting freeze action...');
  const result = await client.governance(freezeRequest);

  if (result.success) {
    console.log('✅ Account frozen successfully!');
    console.log(`Transaction ID: ${result.tx_id}`);
    console.log('');

    // Verify account is frozen - attempt transfer should fail
    console.log('🧪 Testing freeze enforcement...');
    const transferResult = await client.transfer({
      inputs: ['UTXO_123'],
      outputs: [{ owner_id: 'user_bob', amount: 1000, asset_code: 'GENUSD' }],
      sender_id: 'user_suspicious',
      dilithium_signature: '',
    });

    if (!transferResult.success && transferResult.error?.includes('frozen')) {
      console.log('✅ Freeze enforced - transfer blocked as expected');
    } else {
      console.log('⚠️  Freeze might not be enforced properly');
    }

    // Later: Unfreeze after investigation
    console.log('\n⏳ Unfreezing account after investigation...');
    const unfreezeResult = await client.governance({
      action: 'unfreeze',
      target_user: 'user_suspicious',
      reason: 'Investigation completed - no violations found',
      admin_id: 'admin_001',
      dilithium_signature: '',
    });

    if (unfreezeResult.success) {
      console.log('✅ Account unfrozen successfully!');
    } else {
      console.error('❌ Unfreeze failed:', unfreezeResult.error);
    }
  } else {
    console.error('❌ Freeze failed:', result.error);
  }
}

main().catch(console.error);
