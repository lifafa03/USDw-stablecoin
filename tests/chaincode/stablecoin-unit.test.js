/**
 * ==============================================================================
 * STABLECOIN CHAINCODE UNIT TESTS
 * ==============================================================================
 * 
 * This test suite exercises the Stablecoin chaincode logic using mocked
 * Fabric context/stub objects, allowing tests to run without a live network.
 * 
 * HOW TO RUN TESTS:
 * -----------------
 * 1. Navigate to the tests/chaincode directory:
 *    cd tests/chaincode
 * 
 * 2. Install dependencies (if not already installed):
 *    npm install
 * 
 * 3. Run the tests:
 *    npm run test:unit
 *    
 *    Or use Mocha directly:
 *    npx mocha stablecoin-unit.test.js
 * 
 * WHAT THESE TESTS COVER:
 * -----------------------
 * ✓ Mint 1000 units to account central_bank
 * ✓ Transfer 200 units from central_bank to user1
 * ✓ Burn 100 units from user1
 * ✓ Assert expected balances and totalSupply after each step
 * ✓ Verify that transferring more than available balance throws an error
 * ✓ Additional edge cases and error scenarios
 * 
 * ==============================================================================
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { Context } = require('fabric-contract-api');
const StablecoinContract = require('../../chaincode/stablecoin-js/lib/stablecoin-contract');

/**
 * Helper function to create a mocked transaction context
 * This simulates the Fabric runtime environment for testing
 */
function createMockContext() {
    const stub = {
        // In-memory storage to simulate the world state
        state: new Map(),
        
        // Mock getState - retrieves data from in-memory map
        getState: sinon.stub().callsFake(function(key) {
            const value = this.state.get(key);
            return Promise.resolve(value ? Buffer.from(value) : Buffer.alloc(0));
        }),
        
        // Mock putState - stores data in in-memory map
        putState: sinon.stub().callsFake(function(key, value) {
            this.state.set(key, value.toString());
            return Promise.resolve();
        }),
        
        // Mock createCompositeKey - creates deterministic keys
        createCompositeKey: sinon.stub().callsFake(function(objectType, attributes) {
            return objectType + '~' + attributes.join('~');
        }),
        
        // Mock getTxID - returns a fake transaction ID
        getTxID: sinon.stub().returns('txid-12345'),
        
        // Mock getTxTimestamp - returns current timestamp
        getTxTimestamp: sinon.stub().returns({ seconds: { low: Math.floor(Date.now() / 1000) } })
    };

    const clientIdentity = {
        // Mock getMSPID - returns Org1MSP for admin operations
        getMSPID: sinon.stub().returns('Org1MSP')
    };

    const ctx = new Context();
    ctx.stub = stub;
    ctx.clientIdentity = clientIdentity;

    return ctx;
}

describe('Stablecoin Chaincode - Unit Tests (Mocked Context)', function() {
    let contract;
    let ctx;

    // Create fresh instances before each test to ensure isolation
    beforeEach(function() {
        contract = new StablecoinContract();
        ctx = createMockContext();
    });

    describe('Test Vector: Mint -> Transfer -> Burn Sequence', function() {
        let initialSupply;
        let balanceCentralBank;
        let balanceUser1;
        let currentSupply;

        it('Step 1: Should mint 1000 units to central_bank', async function() {
            // Mint 1000 tokens to central_bank account
            const result = await contract.Mint(ctx, 'central_bank', '1000');

            // Verify the mint result
            expect(result).to.have.property('accountId', 'central_bank');
            expect(result).to.have.property('amount', 1000);
            expect(result).to.have.property('newBalance', 1000);
            expect(result).to.have.property('newTotalSupply', 1000);

            // Query and verify the balance
            const balance = await contract.BalanceOf(ctx, 'central_bank');
            expect(balance.balance).to.equal(1000);
            expect(balance.frozen).to.be.false;

            // Query and verify total supply
            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(1000);

            // Store state for next test
            balanceCentralBank = balance.balance;
            currentSupply = supply.totalSupply;

            console.log(`    ✓ central_bank balance: ${balanceCentralBank}`);
            console.log(`    ✓ Total supply: ${currentSupply}`);
        });

        it('Step 2: Should transfer 200 units from central_bank to user1', async function() {
            // Setup: Mint 1000 to central_bank first
            await contract.Mint(ctx, 'central_bank', '1000');

            // Transfer 200 tokens from central_bank to user1
            const result = await contract.Transfer(ctx, 'central_bank', 'user1', '200');

            // Verify the transfer result
            expect(result).to.have.property('from', 'central_bank');
            expect(result).to.have.property('to', 'user1');
            expect(result).to.have.property('amount', 200);
            expect(result).to.have.property('fromBalance', 800); // 1000 - 200
            expect(result).to.have.property('toBalance', 200);

            // Query and verify central_bank balance
            const balanceCentralBank = await contract.BalanceOf(ctx, 'central_bank');
            expect(balanceCentralBank.balance).to.equal(800);

            // Query and verify user1 balance
            const balanceUser1 = await contract.BalanceOf(ctx, 'user1');
            expect(balanceUser1.balance).to.equal(200);

            // Verify total supply remains unchanged (transfers don't affect supply)
            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(1000);

            console.log(`    ✓ central_bank balance after transfer: ${balanceCentralBank.balance}`);
            console.log(`    ✓ user1 balance after transfer: ${balanceUser1.balance}`);
            console.log(`    ✓ Total supply (unchanged): ${supply.totalSupply}`);
        });

        it('Step 3: Should burn 100 units from user1', async function() {
            // Setup: Mint 1000 to central_bank, then transfer 200 to user1
            await contract.Mint(ctx, 'central_bank', '1000');
            await contract.Transfer(ctx, 'central_bank', 'user1', '200');

            // Burn 100 tokens from user1
            const result = await contract.Burn(ctx, 'user1', '100');

            // Verify the burn result
            expect(result).to.have.property('accountId', 'user1');
            expect(result).to.have.property('amount', 100);
            expect(result).to.have.property('newBalance', 100); // 200 - 100
            expect(result).to.have.property('newTotalSupply', 900); // 1000 - 100

            // Query and verify user1 balance
            const balanceUser1 = await contract.BalanceOf(ctx, 'user1');
            expect(balanceUser1.balance).to.equal(100);

            // Query and verify central_bank balance (should be unchanged)
            const balanceCentralBank = await contract.BalanceOf(ctx, 'central_bank');
            expect(balanceCentralBank.balance).to.equal(800);

            // Verify total supply decreased by burn amount
            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(900); // 1000 - 100

            console.log(`    ✓ user1 balance after burn: ${balanceUser1.balance}`);
            console.log(`    ✓ central_bank balance (unchanged): ${balanceCentralBank.balance}`);
            console.log(`    ✓ Total supply after burn: ${supply.totalSupply}`);
        });

        it('Step 4: Should verify complete state after all operations', async function() {
            // Execute the complete sequence
            await contract.Mint(ctx, 'central_bank', '1000');
            await contract.Transfer(ctx, 'central_bank', 'user1', '200');
            await contract.Burn(ctx, 'user1', '100');

            // Final verification of all balances
            const balanceCentralBank = await contract.BalanceOf(ctx, 'central_bank');
            const balanceUser1 = await contract.BalanceOf(ctx, 'user1');
            const supply = await contract.TotalSupply(ctx);

            // Assert final expected state
            expect(balanceCentralBank.balance).to.equal(800, 'central_bank should have 800');
            expect(balanceUser1.balance).to.equal(100, 'user1 should have 100');
            expect(supply.totalSupply).to.equal(900, 'total supply should be 900');

            // Verify the math: sum of balances should equal total supply
            const sumOfBalances = balanceCentralBank.balance + balanceUser1.balance;
            expect(sumOfBalances).to.equal(supply.totalSupply, 'Sum of balances should equal total supply');

            console.log('\n    Final State Summary:');
            console.log(`    ├─ central_bank: ${balanceCentralBank.balance} tokens`);
            console.log(`    ├─ user1: ${balanceUser1.balance} tokens`);
            console.log(`    ├─ Total Supply: ${supply.totalSupply} tokens`);
            console.log(`    └─ Balance Sum = Supply: ${sumOfBalances === supply.totalSupply ? '✓' : '✗'}`);
        });
    });

    describe('Error Handling: Insufficient Balance', function() {
        it('Should fail to transfer more than available balance', async function() {
            // Setup: Mint 1000 to central_bank
            await contract.Mint(ctx, 'central_bank', '1000');

            // Attempt to transfer 1001 tokens (more than balance of 1000)
            try {
                await contract.Transfer(ctx, 'central_bank', 'user1', '1001');
                expect.fail('Should have thrown an error for insufficient balance');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
                expect(error.message).to.include('central_bank');
                console.log(`    ✓ Correctly rejected: "${error.message}"`);
            }

            // Verify balance unchanged after failed transfer
            const balance = await contract.BalanceOf(ctx, 'central_bank');
            expect(balance.balance).to.equal(1000, 'Balance should remain unchanged');
        });

        it('Should fail to burn more than available balance', async function() {
            // Setup: Mint 500 to user1
            await contract.Mint(ctx, 'user1', '500');

            // Attempt to burn 501 tokens (more than balance of 500)
            try {
                await contract.Burn(ctx, 'user1', '501');
                expect.fail('Should have thrown an error for insufficient balance');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
                expect(error.message).to.include('user1');
                console.log(`    ✓ Correctly rejected: "${error.message}"`);
            }

            // Verify balance unchanged after failed burn
            const balance = await contract.BalanceOf(ctx, 'user1');
            expect(balance.balance).to.equal(500, 'Balance should remain unchanged');
        });

        it('Should fail to transfer from account with zero balance', async function() {
            // Attempt to transfer from account that has never been funded
            try {
                await contract.Transfer(ctx, 'empty_account', 'user1', '100');
                expect.fail('Should have thrown an error for insufficient balance');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
                console.log(`    ✓ Correctly rejected: "${error.message}"`);
            }
        });
    });

    describe('Initialization', function() {
        it('Should initialize ledger with zero total supply', async function() {
            const result = await contract.InitLedger(ctx);
            
            expect(result).to.have.property('message');
            expect(result.message).to.include('initialized');

            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(0);
        });

        it('Should return zero balance for non-existent account', async function() {
            const balance = await contract.BalanceOf(ctx, 'nonexistent_account');
            
            expect(balance.balance).to.equal(0);
            expect(balance.frozen).to.be.false;
        });
    });

    describe('Minting Operations', function() {
        it('Should mint tokens with correct state updates', async function() {
            const result = await contract.Mint(ctx, 'test_account', '500');

            expect(result.accountId).to.equal('test_account');
            expect(result.amount).to.equal(500);
            expect(result.newBalance).to.equal(500);
            expect(result.newTotalSupply).to.equal(500);
        });

        it('Should mint additional tokens to existing account', async function() {
            // First mint
            await contract.Mint(ctx, 'test_account', '300');
            
            // Second mint to same account
            const result = await contract.Mint(ctx, 'test_account', '200');

            expect(result.newBalance).to.equal(500); // 300 + 200
            expect(result.newTotalSupply).to.equal(500);
        });

        it('Should fail to mint with invalid amount (negative)', async function() {
            try {
                await contract.Mint(ctx, 'test_account', '-100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('Should fail to mint with invalid amount (zero)', async function() {
            try {
                await contract.Mint(ctx, 'test_account', '0');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('Should fail to mint with invalid amount (non-numeric)', async function() {
            try {
                await contract.Mint(ctx, 'test_account', 'abc');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('Should fail to mint with empty account ID', async function() {
            try {
                await contract.Mint(ctx, '', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Account ID must be provided');
            }
        });

        it('Should fail to mint when caller is not admin', async function() {
            // Change MSP to non-admin
            ctx.clientIdentity.getMSPID.returns('Org2MSP');

            try {
                await contract.Mint(ctx, 'test_account', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Only admin');
            }
        });
    });

    describe('Transfer Operations', function() {
        beforeEach(async function() {
            // Setup: Mint tokens to sender before each transfer test
            await contract.Mint(ctx, 'sender', '1000');
        });

        it('Should transfer tokens between accounts', async function() {
            const result = await contract.Transfer(ctx, 'sender', 'receiver', '300');

            expect(result.from).to.equal('sender');
            expect(result.to).to.equal('receiver');
            expect(result.amount).to.equal(300);
            expect(result.fromBalance).to.equal(700);
            expect(result.toBalance).to.equal(300);
        });

        it('Should handle transfer to account with existing balance', async function() {
            // Setup: Give receiver initial balance
            await contract.Mint(ctx, 'receiver', '200');

            // Transfer additional tokens
            const result = await contract.Transfer(ctx, 'sender', 'receiver', '300');

            expect(result.toBalance).to.equal(500); // 200 + 300
        });

        it('Should not change total supply after transfer', async function() {
            const supplyBefore = await contract.TotalSupply(ctx);

            await contract.Transfer(ctx, 'sender', 'receiver', '300');

            const supplyAfter = await contract.TotalSupply(ctx);
            expect(supplyAfter.totalSupply).to.equal(supplyBefore.totalSupply);
        });

        it('Should fail to transfer to same account', async function() {
            try {
                await contract.Transfer(ctx, 'sender', 'sender', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Cannot transfer to the same account');
            }
        });

        it('Should fail to transfer with invalid amount', async function() {
            try {
                await contract.Transfer(ctx, 'sender', 'receiver', '0');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('Should fail to transfer with empty from account', async function() {
            try {
                await contract.Transfer(ctx, '', 'receiver', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('From account ID must be provided');
            }
        });

        it('Should fail to transfer with empty to account', async function() {
            try {
                await contract.Transfer(ctx, 'sender', '', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('To account ID must be provided');
            }
        });

        it('Should fail to transfer from frozen account', async function() {
            // Freeze the sender account
            await contract.FreezeAccount(ctx, 'sender');

            try {
                await contract.Transfer(ctx, 'sender', 'receiver', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('frozen');
            }
        });
    });

    describe('Burn Operations', function() {
        beforeEach(async function() {
            // Setup: Mint tokens before each burn test
            await contract.Mint(ctx, 'burner', '1000');
        });

        it('Should burn tokens with correct state updates', async function() {
            const result = await contract.Burn(ctx, 'burner', '300');

            expect(result.accountId).to.equal('burner');
            expect(result.amount).to.equal(300);
            expect(result.newBalance).to.equal(700);
            expect(result.newTotalSupply).to.equal(700);
        });

        it('Should decrease total supply after burn', async function() {
            const supplyBefore = await contract.TotalSupply(ctx);

            await contract.Burn(ctx, 'burner', '300');

            const supplyAfter = await contract.TotalSupply(ctx);
            expect(supplyAfter.totalSupply).to.equal(supplyBefore.totalSupply - 300);
        });

        it('Should allow burning entire balance', async function() {
            const result = await contract.Burn(ctx, 'burner', '1000');

            expect(result.newBalance).to.equal(0);
            expect(result.newTotalSupply).to.equal(0);
        });

        it('Should fail to burn with invalid amount', async function() {
            try {
                await contract.Burn(ctx, 'burner', '-100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Invalid amount');
            }
        });

        it('Should fail to burn with empty account ID', async function() {
            try {
                await contract.Burn(ctx, '', '100');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Account ID must be provided');
            }
        });
    });

    describe('Balance Queries', function() {
        it('Should return correct balance for account with tokens', async function() {
            await contract.Mint(ctx, 'test_account', '750');

            const balance = await contract.BalanceOf(ctx, 'test_account');

            expect(balance.accountId).to.equal('test_account');
            expect(balance.balance).to.equal(750);
            expect(balance.frozen).to.be.false;
        });

        it('Should return zero balance for new account', async function() {
            const balance = await contract.BalanceOf(ctx, 'new_account');

            expect(balance.balance).to.equal(0);
            expect(balance.frozen).to.be.false;
        });

        it('Should fail with empty account ID', async function() {
            try {
                await contract.BalanceOf(ctx, '');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Account ID must be provided');
            }
        });
    });

    describe('Total Supply Queries', function() {
        it('Should return zero for uninitialized ledger', async function() {
            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(0);
        });

        it('Should track total supply through mint operations', async function() {
            await contract.Mint(ctx, 'account1', '500');
            await contract.Mint(ctx, 'account2', '300');

            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(800);
        });

        it('Should track total supply through mint and burn operations', async function() {
            await contract.Mint(ctx, 'account1', '1000');
            await contract.Burn(ctx, 'account1', '250');

            const supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(750);
        });
    });

    describe('Account Freezing', function() {
        beforeEach(async function() {
            await contract.Mint(ctx, 'freeze_test', '1000');
        });

        it('Should freeze an account', async function() {
            const result = await contract.FreezeAccount(ctx, 'freeze_test');

            expect(result.accountId).to.equal('freeze_test');
            expect(result.frozen).to.be.true;
            expect(result.balance).to.equal(1000);
        });

        it('Should reflect frozen status in balance query', async function() {
            await contract.FreezeAccount(ctx, 'freeze_test');

            const balance = await contract.BalanceOf(ctx, 'freeze_test');
            expect(balance.frozen).to.be.true;
        });

        it('Should unfreeze an account', async function() {
            await contract.FreezeAccount(ctx, 'freeze_test');
            const result = await contract.UnfreezeAccount(ctx, 'freeze_test');

            expect(result.accountId).to.equal('freeze_test');
            expect(result.frozen).to.be.false;
        });

        it('Should allow transfers after unfreezing', async function() {
            await contract.FreezeAccount(ctx, 'freeze_test');
            await contract.UnfreezeAccount(ctx, 'freeze_test');

            // Should not throw
            const result = await contract.Transfer(ctx, 'freeze_test', 'receiver', '100');
            expect(result.amount).to.equal(100);
        });

        it('Should fail to freeze when caller is not admin', async function() {
            ctx.clientIdentity.getMSPID.returns('Org2MSP');

            try {
                await contract.FreezeAccount(ctx, 'freeze_test');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Only admin');
            }
        });

        it('Should fail to unfreeze when caller is not admin', async function() {
            await contract.FreezeAccount(ctx, 'freeze_test');
            ctx.clientIdentity.getMSPID.returns('Org2MSP');

            try {
                await contract.UnfreezeAccount(ctx, 'freeze_test');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Only admin');
            }
        });
    });

    describe('Complex Scenarios', function() {
        it('Should handle multiple accounts with various operations', async function() {
            // Mint to multiple accounts
            await contract.Mint(ctx, 'alice', '1000');
            await contract.Mint(ctx, 'bob', '500');
            await contract.Mint(ctx, 'charlie', '750');

            // Verify total supply
            let supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(2250);

            // Alice transfers to Bob
            await contract.Transfer(ctx, 'alice', 'bob', '200');

            // Bob burns some tokens
            await contract.Burn(ctx, 'bob', '100');

            // Charlie transfers to Alice
            await contract.Transfer(ctx, 'charlie', 'alice', '250');

            // Verify final balances
            const aliceBalance = await contract.BalanceOf(ctx, 'alice');
            const bobBalance = await contract.BalanceOf(ctx, 'bob');
            const charlieBalance = await contract.BalanceOf(ctx, 'charlie');

            expect(aliceBalance.balance).to.equal(1050); // 1000 - 200 + 250
            expect(bobBalance.balance).to.equal(600); // 500 + 200 - 100
            expect(charlieBalance.balance).to.equal(500); // 750 - 250

            // Verify final supply
            supply = await contract.TotalSupply(ctx);
            expect(supply.totalSupply).to.equal(2150); // 2250 - 100 (burned)
        });

        it('Should handle decimal amounts', async function() {
            await contract.Mint(ctx, 'decimal_test', '100.50');
            
            const balance = await contract.BalanceOf(ctx, 'decimal_test');
            expect(balance.balance).to.equal(100.50);

            await contract.Transfer(ctx, 'decimal_test', 'receiver', '25.25');
            
            const updatedBalance = await contract.BalanceOf(ctx, 'decimal_test');
            expect(updatedBalance.balance).to.equal(75.25);
        });

        it('Should maintain consistency across sequential operations', async function() {
            const operations = [
                { op: 'mint', account: 'test', amount: '1000' },
                { op: 'transfer', from: 'test', to: 'user1', amount: '100' },
                { op: 'transfer', from: 'test', to: 'user2', amount: '200' },
                { op: 'burn', account: 'user1', amount: '50' },
                { op: 'transfer', from: 'user2', to: 'user1', amount: '100' },
                { op: 'burn', account: 'test', amount: '100' }
            ];

            for (const op of operations) {
                if (op.op === 'mint') {
                    await contract.Mint(ctx, op.account, op.amount);
                } else if (op.op === 'transfer') {
                    await contract.Transfer(ctx, op.from, op.to, op.amount);
                } else if (op.op === 'burn') {
                    await contract.Burn(ctx, op.account, op.amount);
                }
            }

            // Verify final state
            const testBalance = await contract.BalanceOf(ctx, 'test');
            const user1Balance = await contract.BalanceOf(ctx, 'user1');
            const user2Balance = await contract.BalanceOf(ctx, 'user2');
            const supply = await contract.TotalSupply(ctx);

            expect(testBalance.balance).to.equal(600); // 1000 - 100 - 200 - 100
            expect(user1Balance.balance).to.equal(150); // 100 - 50 + 100
            expect(user2Balance.balance).to.equal(100); // 200 - 100
            expect(supply.totalSupply).to.equal(850); // 1000 - 50 - 100

            // Verify sum of balances equals total supply
            const sum = testBalance.balance + user1Balance.balance + user2Balance.balance;
            expect(sum).to.equal(supply.totalSupply);
        });
    });

    describe('Edge Cases', function() {
        it('Should handle very large amounts', async function() {
            const largeAmount = '999999999999.99';
            await contract.Mint(ctx, 'whale', largeAmount);

            const balance = await contract.BalanceOf(ctx, 'whale');
            expect(balance.balance).to.equal(parseFloat(largeAmount));
        });

        it('Should handle very small decimal amounts', async function() {
            await contract.Mint(ctx, 'small', '0.01');
            
            const balance = await contract.BalanceOf(ctx, 'small');
            expect(balance.balance).to.equal(0.01);
        });

        it('Should handle accounts with special characters in ID', async function() {
            const accountId = 'user@example.com';
            await contract.Mint(ctx, accountId, '100');

            const balance = await contract.BalanceOf(ctx, accountId);
            expect(balance.balance).to.equal(100);
        });

        it('Should prevent double-spend by verifying balance before transfer', async function() {
            await contract.Mint(ctx, 'spender', '100');

            // First transfer should succeed
            await contract.Transfer(ctx, 'spender', 'receiver1', '60');

            // Second transfer for remaining balance should succeed
            await contract.Transfer(ctx, 'spender', 'receiver2', '40');

            // Third transfer should fail (no balance left)
            try {
                await contract.Transfer(ctx, 'spender', 'receiver3', '1');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Insufficient balance');
            }
        });
    });
});
