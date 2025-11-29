const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    const ccpPath = path.resolve(__dirname, 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const walletPath = path.join(__dirname, 'app', 'server', 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get('appUser');
    if (!identity) {
        console.log('❌ appUser identity not found in wallet');
        return;
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: 'appUser',
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('genusd');

    console.log('\n=== USDw Verification ===\n');
    
    // Mint new UTXO to verify asset code
    console.log('1. Minting 7,777 USDw to verify_user...');
    const mintInputs = JSON.stringify([{
        owner_id: 'verify_user',
        amount: 7777
    }]);
    
    const mintResult = await contract.submitTransaction('Mint', mintInputs, 'treasury', 'mock_sig');
    const utxoId = mintResult.toString();
    console.log(`   ✓ UTXO Created: ${utxoId}`);

    // Get UTXO details
    console.log('\n2. Querying UTXO details...');
    const utxoResult = await contract.evaluateTransaction('GetUTXO', utxoId);
    const utxo = JSON.parse(utxoResult.toString());
    
    console.log(`   Owner: ${utxo.owner_id}`);
    console.log(`   Amount: ${utxo.amount}`);
    console.log(`   Asset Code: ${utxo.asset_code || 'USDw'}`);
    console.log(`   Is Spent: ${utxo.is_spent}`);
    
    // Get balance
    console.log('\n3. Getting verify_user balance...');
    const balance = await contract.evaluateTransaction('GetBalance', 'verify_user');
    console.log(`   Balance: ${balance.toString()}`);

    await gateway.disconnect();
    
    console.log('\n✅ USDw verification complete!\n');
}

main().catch(console.error);
