#!/usr/bin/env node
/**
 * Quick script to mint balances for test users using Fabric Gateway SDK
 * This bypasses the REST API and connects directly like the simulation does
 */

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const CONNECTION_PROFILE = path.resolve(__dirname, '../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json');
const WALLET_PATH = path.resolve(__dirname, '../../app/server/wallet');

async function main() {
    console.log('🔧 Minting balances for test users...\n');

    // Load connection profile
    const ccpJSON = fs.readFileSync(CONNECTION_PROFILE, 'utf8');
    const ccp = JSON.parse(ccpJSON);

    // Load wallet
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
    
    // Check for admin identity
    const identity = await wallet.get('Admin@org1.example.com');
    if (!identity) {
        console.error('❌ Admin identity not found in wallet');
        process.exit(1);
    }

    // Connect to gateway
    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: 'Admin@org1.example.com',
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('genusd');

    console.log('✓ Connected to Fabric network\n');

    // Mint for first 10 users
    const usersToMint = 10;
    const amountPerUser = 500000; // 500K USDw each

    for (let i = 0; i < usersToMint; i++) {
        const userId = `User_${String(i).padStart(5, '0')}`;
        
        try {
            process.stdout.write(`Minting ${amountPerUser} USDw for ${userId}... `);
            
            await contract.submitTransaction('SimpleMint', userId, amountPerUser.toString());
            
            console.log('✓');
        } catch (error) {
            console.log(`❌ ${error.message}`);
        }
    }

    console.log('\n✅ Minting complete!');
    
    // Verify balances using GetUTXO
    console.log('\n📊 Verifying balances:');
    for (let i = 0; i < 5; i++) {
        const userId = `User_${String(i).padStart(5, '0')}`;
        try {
            const utxoBytes = await contract.evaluateTransaction('GetUTXO', userId);
            const utxoData = JSON.parse(utxoBytes.toString());
            console.log(`  ${userId}: ${utxoData.total_balance.toLocaleString()} USDw (${utxoData.utxo_count} UTXOs)`);
        } catch (err) {
            console.log(`  ${userId}: 0 USDw (no UTXOs)`);
        }
    }

    await gateway.disconnect();
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
