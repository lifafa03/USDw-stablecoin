'use strict';

// Import the Fabric Contract API
// This provides the base Contract class and access to the transaction context
const { Contract } = require('fabric-contract-api');

// Basic token metadata and controls
const TOKEN_METADATA = {
    name: 'USDwpi',
    symbol: 'USDWPI',
    decimals: 6
};
const DECIMAL_FACTOR = 10 ** TOKEN_METADATA.decimals;
// Set to a number to enforce a cap; null leaves it uncapped
const MAX_SUPPLY = null;

// Simple role mapping by MSP. All roles stay with Org1MSP for this project.
const DEFAULT_ROLE_MAPPINGS = {
    minter: ['Org1MSP'],
    pauser: ['Org1MSP'],
    blocklister: ['Org1MSP']
};

/**
 * StablecoinContract - Account-based stablecoin implementation for Hyperledger Fabric
 * 
 * This smart contract implements a simple stablecoin with the following features:
 * - Minting (creation of new tokens by admin)
 * - Transfers between accounts
 * - Burning (destruction of tokens)
 * - Balance queries
 * - Account freezing/unfreezing
 * - Transaction history tracking
 * 
 * World State Structure:
 * - Accounts are stored with composite key: "acct"~accountId
 * - Total supply is stored with composite key: "meta"~"totalSupply"
 * 
 * @extends Contract
 */
class StablecoinContract extends Contract {

    // ==================== Helper Methods ====================
    // These private methods handle low-level operations with the ledger

    /**
     * Get an account from the world state
     * 
     * This helper function retrieves account information from Fabric's world state.
     * If the account doesn't exist, it returns a new account with zero balance.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The unique identifier for the account
     * @returns {Promise<Object>} The account object with structure: { balance: number, frozen: boolean }
     */
    async _getAccount(ctx, accountId) {
        // Create a composite key for the account
        // Composite keys provide a way to organize data in the ledger
        // Format: "acct"~accountId (e.g., "acct~alice")
        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        
        // Retrieve the account data from the world state
        // getState returns a Buffer (byte array) or null if not found
        const accountBytes = await ctx.stub.getState(accountKey);
        
        // Check if account exists in the ledger
        if (!accountBytes || accountBytes.length === 0) {
            // Return a new account with default values
            // This allows queries on non-existent accounts without errors
            return { balance: 0, frozen: false };
        }
        
        // Parse the JSON string stored in the ledger and return as JavaScript object
        return JSON.parse(accountBytes.toString());
    }

    /**
     * Save an account to the world state
     * 
     * This helper function persists account information to Fabric's world state.
     * The account data is serialized to JSON before storage.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The unique identifier for the account
     * @param {Object} account - The account object to save (must contain balance and frozen)
     */
    async _putAccount(ctx, accountId, account) {
        // Create the same composite key format used in _getAccount
        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        
        // Convert the account object to JSON string, then to Buffer
        // putState requires a Buffer as the value parameter
        await ctx.stub.putState(accountKey, Buffer.from(JSON.stringify(account)));
    }

    /**
     * Get the total supply from the world state
     * 
     * Total supply represents the sum of all tokens in circulation.
     * It increases with Mint operations and decreases with Burn operations.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @returns {Promise<number>} The current total supply of tokens
     */
    async _getTotalSupply(ctx) {
        // Create composite key for the metadata
        // Using "meta" prefix to distinguish from account keys
        const supplyKey = ctx.stub.createCompositeKey('meta', ['totalSupply']);
        
        // Retrieve the total supply value from world state
        const supplyBytes = await ctx.stub.getState(supplyKey);
        
        // If total supply hasn't been initialized, return 0
        if (!supplyBytes || supplyBytes.length === 0) {
            return 0;
        }
        
        // Parse the stored value as a floating-point number
        return parseFloat(supplyBytes.toString());
    }

    /**
     * Save the total supply to the world state
     * 
     * This helper updates the total supply counter in the ledger.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {number} supply - The new total supply value to store
     */
    async _putTotalSupply(ctx, supply) {
        // Create the same composite key format used in _getTotalSupply
        const supplyKey = ctx.stub.createCompositeKey('meta', ['totalSupply']);
        
        // Convert the number to string, then to Buffer for storage
        await ctx.stub.putState(supplyKey, Buffer.from(supply.toString()));
    }

    /**
     * Retrieve role mappings from state (falls back to defaults)
     */
    async _getRoles(ctx) {
        const key = ctx.stub.createCompositeKey('meta', ['roles']);
        const roleBytes = await ctx.stub.getState(key);
        if (!roleBytes || roleBytes.length === 0) {
            return JSON.parse(JSON.stringify(DEFAULT_ROLE_MAPPINGS));
        }
        return JSON.parse(roleBytes.toString());
    }

    /**
     * Persist role mappings
     */
    async _putRoles(ctx, roles) {
        const key = ctx.stub.createCompositeKey('meta', ['roles']);
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(roles)));
    }

    /**
     * Validate that the caller has a required role
     */
    async _requireRole(ctx, role) {
        const roles = await this._getRoles(ctx);
        const allowed = roles[role] || [];
        const mspId = ctx.clientIdentity.getMSPID();
        if (!allowed.includes(mspId)) {
            throw new Error(`Operation requires role ${role}. Allowed MSPs: ${allowed.join(', ') || 'none'}, caller MSP: ${mspId}`);
        }
    }

    /**
     * Check if the caller is an admin (kept for freeze/unfreeze)
     */
    _isAdmin(ctx) {
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Only admin (Org1MSP) can perform this operation. Current MSP: ${mspId}`);
        }
        return true;
    }

    /**
     * Parse a decimal string into base units (integer) respecting TOKEN_METADATA.decimals
     */
    _parseAmountToUnits(amount) {
        if (amount === undefined || amount === null) {
            throw new Error('Amount must be provided');
        }
        const amountStr = amount.toString().trim();
        if (!/^\d+(\.\d+)?$/.test(amountStr)) {
            throw new Error(`Invalid amount: ${amount}. Use a positive number with up to ${TOKEN_METADATA.decimals} decimals.`);
        }
        const [whole, fraction = ''] = amountStr.split('.');
        if (fraction.length > TOKEN_METADATA.decimals) {
            throw new Error(`Too many decimal places. Max allowed: ${TOKEN_METADATA.decimals}`);
        }
        const paddedFraction = fraction.padEnd(TOKEN_METADATA.decimals, '0');
        const units = Number(whole) * DECIMAL_FACTOR + Number(paddedFraction);
        if (!Number.isFinite(units) || units <= 0) {
            throw new Error(`Invalid amount after conversion: ${amount}`);
        }
        return units;
    }

    /**
     * Pause flag helpers
     */
    async _getPauseFlag(ctx) {
        const key = ctx.stub.createCompositeKey('meta', ['paused']);
        const pausedBytes = await ctx.stub.getState(key);
        if (!pausedBytes || pausedBytes.length === 0) {
            return false;
        }
        return pausedBytes.toString() === 'true';
    }

    async _setPauseFlag(ctx, paused) {
        const key = ctx.stub.createCompositeKey('meta', ['paused']);
        await ctx.stub.putState(key, Buffer.from(paused ? 'true' : 'false'));
    }

    /**
     * Blocklist helpers
     */
    async _getBlocklist(ctx) {
        const key = ctx.stub.createCompositeKey('meta', ['blocklist']);
        const blockBytes = await ctx.stub.getState(key);
        if (!blockBytes || blockBytes.length === 0) {
            return {};
        }
        return JSON.parse(blockBytes.toString());
    }

    async _putBlocklist(ctx, blocklist) {
        const key = ctx.stub.createCompositeKey('meta', ['blocklist']);
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(blocklist)));
    }

    async _isBlocked(ctx, accountId) {
        const blocklist = await this._getBlocklist(ctx);
        return !!blocklist[accountId];
    }

    async _ensureNotBlocked(ctx, accountId) {
        if (await this._isBlocked(ctx, accountId)) {
            throw new Error(`Account ${accountId} is blocklisted`);
        }
    }

    // ==================== Public Transaction Methods ====================
    // These methods are exposed as chaincode functions and can be invoked by clients

    /**
     * Initialize the ledger (optional, called during instantiation)
     * 
     * This function is typically called once when the chaincode is first deployed.
     * It sets up the initial state of the ledger, starting with zero total supply.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @returns {Object} Success message
     */
    async InitLedger(ctx) {
        console.log('Initializing stablecoin ledger');
        
        // Set initial total supply to 0 and clear controls
        await this._putTotalSupply(ctx, 0);
        await this._setPauseFlag(ctx, false);
        await this._putBlocklist(ctx, {});
        await this._putRoles(ctx, DEFAULT_ROLE_MAPPINGS);
        
        return { message: 'Ledger initialized successfully' };
    }

    /**
     * Mint new tokens to an account (admin only)
     * 
     * Minting creates new tokens out of thin air and adds them to a specified account.
     * This operation increases both the account balance and the total supply.
     * Only administrators (Org1MSP members) can mint tokens.
     * 
     * Use cases:
     * - Initial distribution of tokens
     * - Backing new tokens with reserves (in a real CBDC)
     * - Expanding the money supply
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account to receive the newly minted tokens
     * @param {string} amount - The number of tokens to mint (as string)
     * @returns {Promise<Object>} Transaction result with new balances
     * @throws {Error} If caller is not admin or if inputs are invalid
     */
    async Mint(ctx, accountId, amount) {
        // Step 1: Validate inputs
        // Ensure accountId is provided and not empty
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 2: Check permissions
        // Only minters can mint tokens (throws error if not allowed)
        await this._requireRole(ctx, 'minter');
        
        // Step 3: Validate and parse the amount
        // Convert to base units (integer, 6 decimals)
        const mintAmount = this._parseAmountToUnits(amount);

        // Step 4: Retrieve current state from the ledger
        // Get the target account (creates new one if doesn't exist)
        const account = await this._getAccount(ctx, accountId);
        
        // Ensure target is not blocklisted
        await this._ensureNotBlocked(ctx, accountId);
        
        // Get the current total supply
        const totalSupply = await this._getTotalSupply(ctx);

        // Enforce supply cap if set
        if (MAX_SUPPLY !== null && (totalSupply + mintAmount) > MAX_SUPPLY) {
            throw new Error(`Mint would exceed max supply. Cap: ${MAX_SUPPLY}, current: ${totalSupply}, requested: ${mintAmount}`);
        }

        // Step 5: Update balances
        // Add the minted amount to the account's existing balance
        // Using || 0 as a safety check in case balance is undefined
        account.balance = (account.balance || 0) + mintAmount;
        
        // Increase the total supply by the minted amount
        const newTotalSupply = totalSupply + mintAmount;

        // Step 6: Persist the updated state to the ledger
        // Save the updated account
        await this._putAccount(ctx, accountId, account);
        
        // Save the updated total supply
        await this._putTotalSupply(ctx, newTotalSupply);

        // Step 7: Log the operation for debugging/auditing
        console.log(`Minted ${mintAmount} to ${accountId}. New balance: ${account.balance}`);
        ctx.stub.setEvent('Mint', Buffer.from(JSON.stringify({
            accountId,
            amount: mintAmount,
            newBalance: account.balance,
            newTotalSupply
        })));
        
        // Step 8: Return transaction result
        // This result is returned to the client and recorded in the transaction
        return {
            accountId: accountId,
            amount: mintAmount,
            newBalance: account.balance,
            newTotalSupply: newTotalSupply
        };
    }

    /**
     * Transfer tokens from one account to another
     * 
     * This function implements peer-to-peer token transfers between accounts.
     * It performs a double-entry bookkeeping operation: deducting from sender
     * and crediting to receiver. The total supply remains unchanged.
     * 
     * Business rules enforced:
     * - Sender must have sufficient balance
     * - Sender account must not be frozen
     * - Cannot transfer to the same account
     * - Amount must be positive
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} fromAccountId - The sender's account ID
     * @param {string} toAccountId - The receiver's account ID
     * @param {string} amount - The number of tokens to transfer (as string)
     * @returns {Promise<Object>} Transaction result with updated balances
     * @throws {Error} If validation fails or insufficient balance
     */
    async Transfer(ctx, fromAccountId, toAccountId, amount) {
        // Step 1: Validate input parameters
        // Check that sender account ID is provided
        if (!fromAccountId || fromAccountId.trim() === '') {
            throw new Error('From account ID must be provided');
        }
        
        // Check that receiver account ID is provided
        if (!toAccountId || toAccountId.trim() === '') {
            throw new Error('To account ID must be provided');
        }
        
        // Prevent transfers to the same account (would be pointless and could mask errors)
        if (fromAccountId === toAccountId) {
            throw new Error('Cannot transfer to the same account');
        }
        
        // Step 2: Validate and parse the transfer amount
        const transferAmount = this._parseAmountToUnits(amount);

        // Step 2a: Ensure transfers are not paused
        if (await this._getPauseFlag(ctx)) {
            throw new Error('Transfers are currently paused');
        }

        // Step 3: Retrieve both accounts from the ledger
        // Load sender's account
        const fromAccount = await this._getAccount(ctx, fromAccountId);
        
        // Load receiver's account (creates new account if doesn't exist)
        const toAccount = await this._getAccount(ctx, toAccountId);

        // Blocklist checks
        await this._ensureNotBlocked(ctx, fromAccountId);
        await this._ensureNotBlocked(ctx, toAccountId);

        // Step 4: Check business rules
        // Verify sender account is not frozen (frozen accounts cannot send transfers)
        if (fromAccount.frozen) {
            throw new Error(`Account ${fromAccountId} is frozen`);
        }

        // Step 5: Verify sender has sufficient balance
        // This is critical to prevent double-spending and negative balances
        if (fromAccount.balance < transferAmount) {
            throw new Error(
                `Insufficient balance. Account ${fromAccountId} has ${fromAccount.balance}, ` +
                `but tried to transfer ${transferAmount}`
            );
        }

        // Step 6: Execute the transfer (double-entry bookkeeping)
        // Deduct the amount from sender's balance
        fromAccount.balance -= transferAmount;
        
        // Add the amount to receiver's balance
        // Using || 0 as safety for new accounts
        toAccount.balance = (toAccount.balance || 0) + transferAmount;

        // Step 7: Persist both updated accounts to the ledger
        // Save sender's account with reduced balance
        await this._putAccount(ctx, fromAccountId, fromAccount);
        
        // Save receiver's account with increased balance
        await this._putAccount(ctx, toAccountId, toAccount);

        // Step 8: Log the transaction for debugging/auditing
        console.log(`Transferred ${transferAmount} from ${fromAccountId} to ${toAccountId}`);
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify({
            from: fromAccountId,
            to: toAccountId,
            amount: transferAmount,
            fromBalance: fromAccount.balance,
            toBalance: toAccount.balance
        })));
        
        // Step 9: Return transaction details
        // Note: Total supply is not changed during transfers
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
     * 
     * Burning destroys tokens, permanently removing them from circulation.
     * This operation decreases both the account balance and the total supply.
     * Any user can burn tokens from their own account (no admin restriction).
     * 
     * Use cases:
     * - Reducing money supply (deflationary policy)
     * - Redeeming tokens for underlying reserves
     * - Removing tokens from circulation
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account from which to burn tokens
     * @param {string} amount - The number of tokens to burn (as string)
     * @returns {Promise<Object>} Transaction result with new balances
     * @throws {Error} If inputs are invalid or insufficient balance
     */
    async Burn(ctx, accountId, amount) {
        // Step 1: Validate inputs
        // Ensure account ID is provided
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 2: Validate and parse the burn amount
        const burnAmount = this._parseAmountToUnits(amount);

        // Step 3: Retrieve current state from the ledger
        // Get the account to burn from
        const account = await this._getAccount(ctx, accountId);
        
        // Ensure not blocklisted
        await this._ensureNotBlocked(ctx, accountId);
        
        // Get the current total supply
        const totalSupply = await this._getTotalSupply(ctx);

        // Step 4: Verify sufficient balance
        // Cannot burn more tokens than the account holds
        if (account.balance < burnAmount) {
            throw new Error(
                `Insufficient balance to burn. Account ${accountId} has ${account.balance}, ` +
                `but tried to burn ${burnAmount}`
            );
        }

        // Step 5: Update balances
        // Deduct the burned amount from the account
        account.balance -= burnAmount;
        
        // Decrease the total supply by the burned amount
        const newTotalSupply = totalSupply - burnAmount;

        // Step 6: Persist the updated state to the ledger
        // Save the updated account balance
        await this._putAccount(ctx, accountId, account);
        
        // Save the updated total supply
        await this._putTotalSupply(ctx, newTotalSupply);

        // Step 7: Log the operation for debugging/auditing
        console.log(`Burned ${burnAmount} from ${accountId}. New balance: ${account.balance}`);
        ctx.stub.setEvent('Burn', Buffer.from(JSON.stringify({
            accountId,
            amount: burnAmount,
            newBalance: account.balance,
            newTotalSupply
        })));
        
        // Step 8: Return transaction result
        return {
            accountId: accountId,
            amount: burnAmount,
            newBalance: account.balance,
            newTotalSupply: newTotalSupply
        };
    }

    /**
     * Get the balance of an account
     * 
     * This is a read-only query function that returns the current balance
     * and frozen status of an account. It does not modify the ledger state.
     * If the account doesn't exist, returns a balance of 0.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account ID to query
     * @returns {Promise<Object>} Account information including balance and frozen status
     * @throws {Error} If account ID is not provided
     */
    async BalanceOf(ctx, accountId) {
        // Step 1: Validate input
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 2: Retrieve the account from the ledger
        // If account doesn't exist, _getAccount returns { balance: 0, frozen: false }
        const account = await this._getAccount(ctx, accountId);
        
        // Step 3: Return account information
        return {
            accountId: accountId,
            balance: account.balance,
            frozen: account.frozen || false
        };
    }

    /**
     * Get the total supply of the stablecoin
     * 
     * This is a read-only query function that returns the current total
     * number of tokens in circulation across all accounts.
     * Total supply = sum of all minted tokens - sum of all burned tokens
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @returns {Promise<Object>} Object containing the total supply
     */
    async TotalSupply(ctx) {
        // Step 1: Retrieve total supply from the ledger
        const totalSupply = await this._getTotalSupply(ctx);
        
        // Step 2: Return the result
        return {
            totalSupply: totalSupply
        };
    }

    /**
     * Get the transaction history for an account
     * 
     * This function leverages Hyperledger Fabric's built-in history feature to
     * retrieve all historical states of an account. Each time an account is
     * modified, Fabric records the change with a transaction ID and timestamp.
     * 
     * This is useful for:
     * - Auditing account activity
     * - Investigating disputes
     * - Regulatory compliance (transaction tracking)
     * - Analyzing account behavior patterns
     * 
     * Note: The history API returns ALL modifications to a key, in order.
     * In production, you might want to implement pagination for accounts
     * with many transactions.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account ID to query history for
     * @returns {Promise<Array>} Array of historical records with timestamps and balances
     * @throws {Error} If account ID is not provided
     */
    async GetAccountHistory(ctx, accountId) {
        // Step 1: Validate input
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }

        // Step 2: Create the composite key for the account
        const accountKey = ctx.stub.createCompositeKey('acct', [accountId]);
        
        // Array to store historical records
        const history = [];

        // Step 3: Get the history iterator from Fabric
        // This returns an iterator over all historical values for this key
        // Each iteration provides: value, timestamp, txId, isDelete flag
        const iterator = await ctx.stub.getHistoryForKey(accountKey);

        try {
            // Step 4: Iterate through all historical records
            let result = await iterator.next();
            
            // Continue until there are no more records
            while (!result.done) {
                // Extract transaction metadata
                const record = {
                    txId: result.value.txId,           // Transaction ID that modified this key
                    timestamp: result.value.timestamp,  // When the transaction occurred
                    isDelete: result.value.isDelete     // Whether this was a delete operation
                };

                // Step 5: Parse the historical value if it exists
                // If this wasn't a delete operation and there's data
                if (!result.value.isDelete && result.value.value) {
                    // Parse the account data from this point in history
                    const accountData = JSON.parse(result.value.value.toString());
                    record.balance = accountData.balance;
                    record.frozen = accountData.frozen || false;
                }

                // Add this record to the history array
                history.push(record);
                
                // Move to the next historical record
                result = await iterator.next();
            }
        } finally {
            // Step 6: Always close the iterator to free resources
            // This is critical to prevent resource leaks
            await iterator.close();
        }

        // Step 7: Return the complete history
        return {
            accountId: accountId,
            history: history
        };
    }

    /**
     * Freeze an account (admin only)
     * 
     * Freezing an account prevents it from making transfers (sending tokens).
     * Frozen accounts can still receive tokens and have their balance queried.
     * This is a regulatory/compliance feature for:
     * - Suspicious activity investigation
     * - Court orders/legal holds
     * - AML/KYC violations
     * - Security incidents
     * 
     * Only administrators can freeze accounts.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account to freeze
     * @returns {Promise<Object>} Transaction result with frozen status
     * @throws {Error} If caller is not admin or account ID is invalid
     */
    async FreezeAccount(ctx, accountId) {
        // Step 1: Validate input
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 2: Check permissions
        // Only admins can freeze accounts
        this._isAdmin(ctx);

        // Step 3: Retrieve the account
        const account = await this._getAccount(ctx, accountId);
        
        // Step 4: Set the frozen flag to true
        account.frozen = true;
        
        // Step 5: Save the updated account state
        await this._putAccount(ctx, accountId, account);

        // Step 6: Log the action for auditing
        console.log(`Account ${accountId} has been frozen`);
        
        // Step 7: Return confirmation
        return {
            accountId: accountId,
            frozen: true,
            balance: account.balance
        };
    }

    /**
     * Unfreeze an account (admin only)
     * 
     * Unfreezing removes the transfer restriction from a previously frozen account.
     * The account can resume normal operations (sending and receiving tokens).
     * 
     * Only administrators can unfreeze accounts.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account to unfreeze
     * @returns {Promise<Object>} Transaction result with unfrozen status
     * @throws {Error} If caller is not admin or account ID is invalid
     */
    async UnfreezeAccount(ctx, accountId) {
        // Step 1: Validate input
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 2: Check permissions
        // Only admins can unfreeze accounts
        this._isAdmin(ctx);

        // Step 3: Retrieve the account
        const account = await this._getAccount(ctx, accountId);
        
        // Step 4: Set the frozen flag to false
        account.frozen = false;
        
        // Step 5: Save the updated account state
        await this._putAccount(ctx, accountId, account);

        // Step 6: Log the action for auditing
        console.log(`Account ${accountId} has been unfrozen`);
        
        // Step 7: Return confirmation
        return {
            accountId: accountId,
            frozen: false,
            balance: account.balance
        };
    }

    /**
     * Return token metadata
     */
    async Metadata(ctx) {
        return {
            name: TOKEN_METADATA.name,
            symbol: TOKEN_METADATA.symbol,
            decimals: TOKEN_METADATA.decimals,
            maxSupply: MAX_SUPPLY
        };
    }

    /**
     * Pause transfers (pauser role)
     */
    async Pause(ctx) {
        await this._requireRole(ctx, 'pauser');
        await this._setPauseFlag(ctx, true);
        ctx.stub.setEvent('Pause', Buffer.from(JSON.stringify({ paused: true })));
        return { paused: true };
    }

    /**
     * Unpause transfers (pauser role)
     */
    async Unpause(ctx) {
        await this._requireRole(ctx, 'pauser');
        await this._setPauseFlag(ctx, false);
        ctx.stub.setEvent('Pause', Buffer.from(JSON.stringify({ paused: false })));
        return { paused: false };
    }

    /**
     * Check pause status
     */
    async IsPaused(ctx) {
        const paused = await this._getPauseFlag(ctx);
        return { paused };
    }

    /**
     * Add an account to the blocklist (blocklister role)
     */
    async AddToBlocklist(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        await this._requireRole(ctx, 'blocklister');
        const blocklist = await this._getBlocklist(ctx);
        blocklist[accountId] = true;
        await this._putBlocklist(ctx, blocklist);
        ctx.stub.setEvent('BlocklistUpdate', Buffer.from(JSON.stringify({ accountId, blocked: true })));
        return { accountId, blocked: true };
    }

    /**
     * Remove an account from the blocklist (blocklister role)
     */
    async RemoveFromBlocklist(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        await this._requireRole(ctx, 'blocklister');
        const blocklist = await this._getBlocklist(ctx);
        delete blocklist[accountId];
        await this._putBlocklist(ctx, blocklist);
        ctx.stub.setEvent('BlocklistUpdate', Buffer.from(JSON.stringify({ accountId, blocked: false })));
        return { accountId, blocked: false };
    }

    /**
     * Check if an account is blocklisted
     */
    async IsBlocked(ctx, accountId) {
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        const blocked = await this._isBlocked(ctx, accountId);
        return { accountId, blocked };
    }

    /**
     * Add an MSP to a role (admin only)
     */
    async AddRoleMember(ctx, role, mspId) {
        if (!role || role.trim() === '' || !mspId || mspId.trim() === '') {
            throw new Error('Role and MSP ID must be provided');
        }
        this._isAdmin(ctx);
        const roles = await this._getRoles(ctx);
        if (!roles[role]) {
            roles[role] = [];
        }
        if (!roles[role].includes(mspId)) {
            roles[role].push(mspId);
            await this._putRoles(ctx, roles);
        }
        ctx.stub.setEvent('RoleUpdate', Buffer.from(JSON.stringify({ role, mspId, action: 'added' })));
        return { role, members: roles[role] };
    }

    /**
     * Remove an MSP from a role (admin only)
     */
    async RemoveRoleMember(ctx, role, mspId) {
        if (!role || role.trim() === '' || !mspId || mspId.trim() === '') {
            throw new Error('Role and MSP ID must be provided');
        }
        this._isAdmin(ctx);
        const roles = await this._getRoles(ctx);
        if (roles[role]) {
            roles[role] = roles[role].filter(msp => msp !== mspId);
            await this._putRoles(ctx, roles);
        }
        ctx.stub.setEvent('RoleUpdate', Buffer.from(JSON.stringify({ role, mspId, action: 'removed' })));
        return { role, members: roles[role] || [] };
    }

    /**
     * List roles and members
     */
    async ListRoles(ctx) {
        const roles = await this._getRoles(ctx);
        return roles;
    }
}

// Export the contract class so it can be discovered by Fabric
module.exports = StablecoinContract;
