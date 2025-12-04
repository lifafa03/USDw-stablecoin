const FabricClient = require('./fabric-client');

async function test() {
    const client = new FabricClient();
    
    try {
        console.log('Connecting to Fabric...');
        await client.connect();
        console.log('✓ Connected successfully');
        
        console.log('\nTesting GetBalance...');
        const balance = await client.balanceOf('TestUser_A');
        console.log('Balance:', balance);
        
        console.log('\nTesting GetTotalSupply...');
        const supply = await client.totalSupply();
        console.log('Total Supply:', supply);
        
        console.log('\n✓ All tests passed!');
    } catch (error) {
        console.error('✗ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

test();
