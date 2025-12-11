#!/usr/bin/env node
/**
 * Quick test to verify Transfer function signature
 */

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const CONNECTION_PROFILE = path.resolve(__dirname, '../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json');
const WALLET_PATH = path.resolve(__dirname, '../../app/server/wallet');

async function main() {
    console.log('Testing Transfer function...\n');

    const ccpJSON = fs.readFileSync(CONNECTION_PROFILE, 'utf8');
    const ccp = JSON.parse(ccpJSON);

    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
    const identity = await wallet.get('Admin@org1.example.com');
    if (!identity) {
        console.error('❌ Admin identity not found');
        process.exit(1);
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: 'Admin@org1.example.com',
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('genusd');

    console.log('✓ Connected to Fabric\n');

    // Check UTXOs first
    console.log('=== CHECKING UTXOs ===');
    try {
        const utxo0 = await contract.evaluateTransaction('GetUTXO', 'User_00000');
        console.log('User_00000 UTXO:', utxo0.toString());
    } catch (err) {
        console.log('User_00000 UTXO error:', err.message);
    }

    // Check balances before
    console.log('\n=== BEFORE TRANSFER ===');
    const utxo0Before = JSON.parse((await contract.evaluateTransaction('GetUTXO', 'User_00000')).toString());
    const utxo1Before = JSON.parse((await contract.evaluateTransaction('GetUTXO', 'User_00001')).toString());
    console.log(`User_00000: ${utxo0Before.total_balance.toLocaleString()} USDw`);
    console.log(`User_00001: ${utxo1Before.total_balance.toLocaleString()} USDw`);

    // Attempt SimpleTransfer
    console.log('\n=== ATTEMPTING SIMPLETRANSFER ===');
    try {
        const result = await contract.submitTransaction('SimpleTransfer', 'User_00000', 'User_00001', '1000');
        console.log('✅ SimpleTransfer succeeded!');
        console.log('Result:', result.toString());
    } catch (error) {
        console.log('❌ SimpleTransfer failed:', error.message);
    }

    // Check balances after
    console.log('\n=== AFTER TRANSFER ===');
    const utxo0After = JSON.parse((await contract.evaluateTransaction('GetUTXO', 'User_00000')).toString());
    const utxo1After = JSON.parse((await contract.evaluateTransaction('GetUTXO', 'User_00001')).toString());
    console.log(`User_00000: ${utxo0After.total_balance.toLocaleString()} USDw`);
    console.log(`User_00001: ${utxo1After.total_balance.toLocaleString()} USDw`);

    await gateway.disconnect();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
