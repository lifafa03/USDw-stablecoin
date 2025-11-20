'use strict';

const { Contract } = require('fabric-contract-api');

class StablecoinContract extends Contract {

    // ==================== Helper Methods ====================

    /**
     * Get an account from the world state
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account ID
     * @returns {Promise<Object>} The account object
     */
    async _getAccount(ctx, accountId) {
        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        const accountBytes = await ctx.stub.getState(accountKey);
        
        if (!accountBytes || accountBytes.length === 0) {
            return { balance: 0, frozen: false };
        }
        
        return JSON.parse(accountBytes.toString());
    }

    /**
     * Save an account to the world state
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account ID
     * @param {Object} account - The account object
     */
    async _putAccount(ctx, accountId, account) {
        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        await ctx.stub.putState(accountKey, Buffer.from(JSON.stringify(account)));
    }

    /**
     * Get the total supply from the world state
     * @param {Context} ctx - The transaction context
     * @returns {Promise<number>} The total supply
     */
    async _getTotalSupply(ctx) {
        const supplyKey = ctx.stub.createCompositeKey('meta', ['totalSupply']);
        const supplyBytes = await ctx.stub.getState(supplyKey);
        
        if (!supplyBytes || supplyBytes.length === 0) {
            return 0;
        }
        
        return parseFloat(supplyBytes.toString());
    }

    /**
     * Save the total supply to the world state
     * @param {Context} ctx - The transaction context
     * @param {number} supply - The total supply value
     */
    async _putTotalSupply(ctx, supply) {
        const supplyKey = ctx.stub.createCompositeKey('meta', ['totalSupply']);
        await ctx.stub.putState(supplyKey, Buffer.from(supply.toString()));
    }

    /**
     * Check if the caller is an admin
     * @param {Context} ctx - The transaction context
     * @returns {boolean} True if admin, throws error otherwise
     */
    _isAdmin(ctx) {
        const mspId = ctx.clientIdentity.getMSPID();
        // For Phase 1, only Org1MSP is considered admin
        if (mspId !== 'Org1MSP') {
            throw new Error(`Only admin (Org1MSP) can perform this operation. Current MSP: ${mspId}`);
        }
        return true;
    }

    /**
     * Validate and parse amount
     * @param {string} amount - The amount string
     * @returns {number} The parsed amount
     */
    _validateAmount(amount) {
        const parsedAmount = parseFloat(amount);
        
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new Error(`Invalid amount: ${amount}. Amount must be a positive number.`);
        }
        
        return parsedAmount;
    }

    // ==================== Public Transaction Methods ====================

    /**
     * Initialize the ledger (optional, called during instantiation)
     * @param {Context} ctx - The transaction context
     */
    async InitLedger(ctx) {
        console.log('Initializing stablecoin ledger');
        await this._putTotalSupply(ctx, 0);
        return { message: 'Ledger initialized successfully' };
    }

    /**
     * Mint new tokens to an account (admin only)
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account to mint to
     * @param {string} amount - The amount to mint
     * @returns {Promise<Object>} Transaction result
     */
    async Mint(ctx, accountId, amount) {
        // Validate inputs
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        this._isAdmin(ctx);
        const mintAmount = this._validateAmount(amount);

        // Get current state
        const account = await this._getAccount(ctx, accountId);
        const totalSupply = await this._getTotalSupply(ctx);

        // Update balances
        account.balance = (account.balance || 0) + mintAmount;
        const newTotalSupply = totalSupply + mintAmount;

        // Save state
        await this._putAccount(ctx, accountId, account);
        await this._putTotalSupply(ctx, newTotalSupply);

        console.log(`Minted ${mintAmount} to ${accountId}. New balance: ${account.balance}`);
        
        return {
            accountId: accountId,
            amount: mintAmount,
            newBalance: account.balance,
            newTotalSupply: newTotalSupply
        };
    }

    /**
     * Transfer tokens from one account to another
     * @param {Context} ctx - The transaction context
     * @param {string} fromAccountId - The sender account
     * @param {string} toAccountId - The receiver account
     * @param {string} amount - The amount to transfer
     * @returns {Promise<Object>} Transaction result
     */
    async Transfer(ctx, fromAccountId, toAccountId, amount) {
        // Validate inputs
        if (!fromAccountId || fromAccountId.trim() === '') {
            throw new Error('From account ID must be provided');
        }
        if (!toAccountId || toAccountId.trim() === '') {
            throw new Error('To account ID must be provided');
        }
        if (fromAccountId === toAccountId) {
            throw new Error('Cannot transfer to the same account');
        }
        
        const transferAmount = this._validateAmount(amount);

        // Get accounts
        const fromAccount = await this._getAccount(ctx, fromAccountId);
        const toAccount = await this._getAccount(ctx, toAccountId);

        // Check if sender account is frozen
        if (fromAccount.frozen) {
            throw new Error(`Account ${fromAccountId} is frozen`);
        }

        // Check sufficient balance
        if (fromAccount.balance < transferAmount) {
            throw new Error(
                `Insufficient balance. Account ${fromAccountId} has ${fromAccount.balance}, ` +
                `but tried to transfer ${transferAmount}`
            );
        }

        // Update balances
        fromAccount.balance -= transferAmount;
        toAccount.balance = (toAccount.balance || 0) + transferAmount;

        // Save state
        await this._putAccount(ctx, fromAccountId, fromAccount);
        await this._putAccount(ctx, toAccountId, toAccount);

        console.log(`Transferred ${transferAmount} from ${fromAccountId} to ${toAccountId}`);
        
        return {
            from: fromAccountId,
            to: toAccountId,
            amount: transferAmount,
            fromBalance: fromAccount.balance,
            toBalance: toAccount.balance
        };
    }

    /**
     * Burn tokens from an account
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account to burn from
     * @param {string} amount - The amount to burn
     * @returns {Promise<Object>} Transaction result
     */
    async Burn(ctx, accountId, amount) {
        // Validate inputs
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        const burnAmount = this._validateAmount(amount);

        // Get current state
        const account = await this._getAccount(ctx, accountId);
        const totalSupply = await this._getTotalSupply(ctx);

        // Check sufficient balance
        if (account.balance < burnAmount) {
            throw new Error(
                `Insufficient balance to burn. Account ${accountId} has ${account.balance}, ` +
                `but tried to burn ${burnAmount}`
            );
        }

        // Update balances
        account.balance -= burnAmount;
        const newTotalSupply = totalSupply - burnAmount;

        // Save state
        await this._putAccount(ctx, accountId, account);
        await this._putTotalSupply(ctx, newTotalSupply);

        console.log(`Burned ${burnAmount} from ${accountId}. New balance: ${account.balance}`);
        
        return {
            accountId: accountId,
            amount: burnAmount,
            newBalance: account.balance,
            newTotalSupply: newTotalSupply
        };
    }

    /**
     * Get the balance of an account
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account ID
     * @returns {Promise<Object>} The account balance and frozen status
     */
    async BalanceOf(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        const account = await this._getAccount(ctx, accountId);
        
        return {
            accountId: accountId,
            balance: account.balance,
            frozen: account.frozen || false
        };
    }

    /**
     * Get the total supply of the stablecoin
     * @param {Context} ctx - The transaction context
     * @returns {Promise<Object>} The total supply
     */
    async TotalSupply(ctx) {
        const totalSupply = await this._getTotalSupply(ctx);
        
        return {
            totalSupply: totalSupply
        };
    }

    /**
     * Get the transaction history for an account
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account ID
     * @returns {Promise<Array>} Array of historical records
     */
    async GetAccountHistory(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }

        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        const history = [];

        // Get history iterator
        const iterator = await ctx.stub.getHistoryForKey(accountKey);

        try {
            let result = await iterator.next();
            
            while (!result.done) {
                const record = {
                    txId: result.value.txId,
                    timestamp: result.value.timestamp,
                    isDelete: result.value.isDelete
                };

                if (!result.value.isDelete && result.value.value) {
                    const accountData = JSON.parse(result.value.value.toString());
                    record.balance = accountData.balance;
                    record.frozen = accountData.frozen || false;
                }

                history.push(record);
                result = await iterator.next();
            }
        } finally {
            await iterator.close();
        }

        return {
            accountId: accountId,
            history: history
        };
    }

    /**
     * Freeze an account (admin only)
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account to freeze
     * @returns {Promise<Object>} Transaction result
     */
    async FreezeAccount(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        this._isAdmin(ctx);

        const account = await this._getAccount(ctx, accountId);
        account.frozen = true;
        
        await this._putAccount(ctx, accountId, account);

        console.log(`Account ${accountId} has been frozen`);
        
        return {
            accountId: accountId,
            frozen: true,
            balance: account.balance
        };
    }

    /**
     * Unfreeze an account (admin only)
     * @param {Context} ctx - The transaction context
     * @param {string} accountId - The account to unfreeze
     * @returns {Promise<Object>} Transaction result
     */
    async UnfreezeAccount(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        this._isAdmin(ctx);

        const account = await this._getAccount(ctx, accountId);
        account.frozen = false;
        
        await this._putAccount(ctx, accountId, account);

        console.log(`Account ${accountId} has been unfrozen`);
        
        return {
            accountId: accountId,
            frozen: false,
            balance: account.balance
        };
    }
}

module.exports = StablecoinContract;
