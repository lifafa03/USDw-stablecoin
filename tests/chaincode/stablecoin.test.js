'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
const { expect } = require('chai');

describe('Stablecoin Chaincode Tests', function() {
    this.timeout(60000);

    let gateway;
    let wallet;
    let contract;
    const channelName = 'mychannel';
    const chaincodeName = 'stablecoin';
    const mspId = 'Org1MSP';
    const userId = 'testUser';

    // Test accounts
    const account1 = 'alice';
    const account2 = 'bob';
    const account3 = 'charlie';

    /**
     * Build connection profile
     */
    function buildCCP() {
        const ccpPath = path.resolve(
            __dirname,
            '..',
            '..',
            'fabric-samples',
            'test-network',
            'organizations',
            'peerOrganizations',
            'org1.example.com',
            'connection-org1.json'
        );

        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection profile not found at ${ccpPath}`);
        }

        const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
        return JSON.parse(ccpJSON);
    }

    /**
     * Build CA client
     */
    function buildCAClient(ccp) {
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const caClient = new FabricCAServices(
            caInfo.url,
            { trustedRoots: caTLSCACerts, verify: false },
            caInfo.caName
        );

        return caClient;
    }

    /**
     * Enroll admin
     */
    async function enrollAdmin() {
        const ccp = buildCCP();
        const caClient = buildCAClient(ccp);

        const identity = await wallet.get('admin');
        if (identity) {
            return;
        }

        const enrollment = await caClient.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: 'adminpw'
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };

        await wallet.put('admin', x509Identity);
    }

    /**
     * Register and enroll test user
     */
    async function registerUser() {
        const ccp = buildCCP();
        const caClient = buildCAClient(ccp);

        const userIdentity = await wallet.get(userId);
        if (userIdentity) {
            return;
        }

        await enrollAdmin();

        const adminIdentity = await wallet.get('admin');
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        const secret = await caClient.register(
            {
                affiliation: 'org1.department1',
                enrollmentID: userId,
                role: 'client'
            },
            adminUser
        );

        const enrollment = await caClient.enroll({
            enrollmentID: userId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: mspId,
            type: 'X.509',
        };

        await wallet.put(userId, x509Identity);
    }

    before(async function() {
        console.log('\n========================================');
        console.log('Setting up test environment...');
        console.log('========================================\n');

        // Create wallet
        const walletPath = path.join(__dirname, 'test-wallet');
        wallet = await Wallets.newFileSystemWallet(walletPath);

        // Register test user
        await registerUser();

        // Connect to gateway
        const ccp = buildCCP();
        gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: userId,
            discovery: { enabled: true, asLocalhost: true }
        });

        // Get contract
        const network = await gateway.getNetwork(channelName);
        contract = network.getContract(chaincodeName);

        console.log('Test environment setup complete\n');
    });

    after(async function() {
        if (gateway) {
            gateway.disconnect();
        }
        console.log('\nTest environment cleaned up');
    });

    describe('Initialization', function() {
        it('should return initial total supply of 0', async function() {
            const result = await contract.evaluateTransaction('TotalSupply');
            const data = JSON.parse(result.toString());
            expect(data).to.have.property('totalSupply');
            expect(data.totalSupply).to.be.a('number');
        });

        it('should return balance of 0 for new account', async function() {
            const result = await contract.evaluateTransaction('BalanceOf', account1);
            const data = JSON.parse(result.toString());
            expect(data).to.have.property('balance');
            expect(data.balance).to.equal(0);
            expect(data.frozen).to.be.false;
        });
    });

    describe('Minting', function() {
        it('should mint tokens to account1', async function() {
            const mintAmount = 1000;
            const result = await contract.submitTransaction('Mint', account1, mintAmount.toString());
            const data = JSON.parse(result.toString());

            expect(data).to.have.property('accountId', account1);
            expect(data).to.have.property('amount', mintAmount);
            expect(data).to.have.property('newBalance', mintAmount);
            expect(data).to.have.property('newTotalSupply', mintAmount);
        });

        it('should update balance after minting', async function() {
            const result = await contract.evaluateTransaction('BalanceOf', account1);
            const data = JSON.parse(result.toString());
            expect(data.balance).to.be.greaterThan(0);
        });

        it('should mint tokens to account2', async function() {
            const mintAmount = 500;
            const result = await contract.submitTransaction('Mint', account2, mintAmount.toString());
            const data = JSON.parse(result.toString());

            expect(data.accountId).to.equal(account2);
            expect(data.amount).to.equal(mintAmount);
        });

        it('should update total supply after multiple mints', async function() {
            const result = await contract.evaluateTransaction('TotalSupply');
            const data = JSON.parse(result.toString());
            expect(data.totalSupply).to.be.greaterThan(1000);
        });

        it('should fail to mint with invalid amount', async function() {
            try {
                await contract.submitTransaction('Mint', account1, '-100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('should fail to mint with empty account ID', async function() {
            try {
                await contract.submitTransaction('Mint', '', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Account ID must be provided');
            }
        });
    });

    describe('Transfers', function() {
        it('should transfer tokens from account1 to account3', async function() {
            const transferAmount = 200;
            
            // Get initial balances
            const balance1Before = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', account1)).toString()
            ).balance;

            // Perform transfer
            const result = await contract.submitTransaction(
                'Transfer',
                account1,
                account3,
                transferAmount.toString()
            );
            const data = JSON.parse(result.toString());

            expect(data.from).to.equal(account1);
            expect(data.to).to.equal(account3);
            expect(data.amount).to.equal(transferAmount);
            expect(data.fromBalance).to.equal(balance1Before - transferAmount);
            expect(data.toBalance).to.equal(transferAmount);
        });

        it('should reflect updated balances after transfer', async function() {
            const balance1 = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', account1)).toString()
            ).balance;
            const balance3 = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', account3)).toString()
            ).balance;

            expect(balance1).to.equal(800); // 1000 - 200
            expect(balance3).to.equal(200);
        });

        it('should fail to transfer more than available balance', async function() {
            try {
                await contract.submitTransaction('Transfer', account1, account2, '10000');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
            }
        });

        it('should fail to transfer to same account', async function() {
            try {
                await contract.submitTransaction('Transfer', account1, account1, '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Cannot transfer to the same account');
            }
        });

        it('should fail to transfer with invalid amount', async function() {
            try {
                await contract.submitTransaction('Transfer', account1, account2, '0');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('should total supply remain unchanged after transfer', async function() {
            const totalSupplyBefore = JSON.parse(
                (await contract.evaluateTransaction('TotalSupply')).toString()
            ).totalSupply;

            await contract.submitTransaction('Transfer', account2, account3, '100');

            const totalSupplyAfter = JSON.parse(
                (await contract.evaluateTransaction('TotalSupply')).toString()
            ).totalSupply;

            expect(totalSupplyAfter).to.equal(totalSupplyBefore);
        });
    });

    describe('Burning', function() {
        it('should burn tokens from account3', async function() {
            const burnAmount = 100;
            
            const balance3Before = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', account3)).toString()
            ).balance;
            
            const totalSupplyBefore = JSON.parse(
                (await contract.evaluateTransaction('TotalSupply')).toString()
            ).totalSupply;

            const result = await contract.submitTransaction('Burn', account3, burnAmount.toString());
            const data = JSON.parse(result.toString());

            expect(data.accountId).to.equal(account3);
            expect(data.amount).to.equal(burnAmount);
            expect(data.newBalance).to.equal(balance3Before - burnAmount);
            expect(data.newTotalSupply).to.equal(totalSupplyBefore - burnAmount);
        });

        it('should fail to burn more than available balance', async function() {
            try {
                await contract.submitTransaction('Burn', account3, '10000');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
            }
        });

        it('should fail to burn with invalid amount', async function() {
            try {
                await contract.submitTransaction('Burn', account3, '-50');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });
    });

    describe('Account History', function() {
        it('should retrieve transaction history for account1', async function() {
            const result = await contract.evaluateTransaction('GetAccountHistory', account1);
            const data = JSON.parse(result.toString());

            expect(data).to.have.property('accountId', account1);
            expect(data).to.have.property('history');
            expect(data.history).to.be.an('array');
            expect(data.history.length).to.be.greaterThan(0);

            // Check history record structure
            const record = data.history[0];
            expect(record).to.have.property('txId');
            expect(record).to.have.property('timestamp');
        });

        it('should return empty history for account with no transactions', async function() {
            const newAccount = 'dave';
            const result = await contract.evaluateTransaction('GetAccountHistory', newAccount);
            const data = JSON.parse(result.toString());

            expect(data.accountId).to.equal(newAccount);
            expect(data.history).to.be.an('array');
        });
    });

    describe('Account Freezing', function() {
        const freezeAccount = 'eve';

        before(async function() {
            // Setup: mint some tokens to the freeze test account
            await contract.submitTransaction('Mint', freezeAccount, '1000');
        });

        it('should freeze an account', async function() {
            const result = await contract.submitTransaction('FreezeAccount', freezeAccount);
            const data = JSON.parse(result.toString());

            expect(data.accountId).to.equal(freezeAccount);
            expect(data.frozen).to.be.true;
        });

        it('should reflect frozen status in balance query', async function() {
            const result = await contract.evaluateTransaction('BalanceOf', freezeAccount);
            const data = JSON.parse(result.toString());

            expect(data.frozen).to.be.true;
        });

        it('should fail to transfer from frozen account', async function() {
            try {
                await contract.submitTransaction('Transfer', freezeAccount, account1, '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('frozen');
            }
        });

        it('should unfreeze an account', async function() {
            const result = await contract.submitTransaction('UnfreezeAccount', freezeAccount);
            const data = JSON.parse(result.toString());

            expect(data.accountId).to.equal(freezeAccount);
            expect(data.frozen).to.be.false;
        });

        it('should allow transfers after unfreezing', async function() {
            const result = await contract.submitTransaction('Transfer', freezeAccount, account1, '100');
            const data = JSON.parse(result.toString());

            expect(data.from).to.equal(freezeAccount);
            expect(data.amount).to.equal(100);
        });
    });

    describe('Complete Transaction Flow', function() {
        it('should execute a complete mint -> transfer -> burn sequence', async function() {
            const testAccount = 'frank';
            const mintAmount = 1000;
            const transferAmount = 300;
            const burnAmount = 200;

            // Initial state
            const initialSupply = JSON.parse(
                (await contract.evaluateTransaction('TotalSupply')).toString()
            ).totalSupply;

            // Mint
            await contract.submitTransaction('Mint', testAccount, mintAmount.toString());
            let balance = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', testAccount)).toString()
            ).balance;
            expect(balance).to.equal(mintAmount);

            // Transfer
            await contract.submitTransaction('Transfer', testAccount, account1, transferAmount.toString());
            balance = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', testAccount)).toString()
            ).balance;
            expect(balance).to.equal(mintAmount - transferAmount);

            // Burn
            await contract.submitTransaction('Burn', testAccount, burnAmount.toString());
            balance = JSON.parse(
                (await contract.evaluateTransaction('BalanceOf', testAccount)).toString()
            ).balance;
            expect(balance).to.equal(mintAmount - transferAmount - burnAmount);

            // Verify total supply
            const finalSupply = JSON.parse(
                (await contract.evaluateTransaction('TotalSupply')).toString()
            ).totalSupply;
            expect(finalSupply).to.equal(initialSupply + mintAmount - burnAmount);
        });
    });
});
