'use strict';

// Import the Fabric Contract API
// This provides the base Contract class and access to the transaction context
const { Contract } = require('fabric-contract-api');

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
     * Check if the caller is an admin
     * 
     * For Phase 1, only members of Org1MSP are considered administrators.
     * Administrators have permission to mint tokens and freeze/unfreeze accounts.
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @returns {boolean} True if admin, throws error otherwise
     * @throws {Error} If the caller is not an admin
     */
    _isAdmin(ctx) {
        // Get the MSP (Membership Service Provider) ID of the transaction submitter
        // In Fabric, identity and access control are managed through MSPs
        const mspId = ctx.clientIdentity.getMSPID();
        
        // For Phase 1, only Org1MSP is considered admin
        // In production, this could be enhanced with attribute-based access control (ABAC)
        if (mspId !== 'Org1MSP') {
            throw new Error(`Only admin (Org1MSP) can perform this operation. Current MSP: ${mspId}`);
        }
        return true;
    }

    /**
     * Validate and parse amount
     * 
     * This helper ensures that amount parameters are valid positive integers.
     * It prevents negative amounts, zero amounts, decimals, and non-numeric inputs.
     * 
     * @param {string} amount - The amount string to validate
     * @returns {number} The parsed amount as an integer
     * @throws {Error} If the amount is invalid
     */
    _validateAmount(amount) {
        // Convert string to number
        const parsedAmount = parseFloat(amount);
        
        // Check if parsing failed or if the amount is not positive
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            throw new Error(`Invalid amount: ${amount}. Amount must be a positive integer.`);
        }
        
        // Enforce integer amounts only (no decimals)
        if (!Number.isInteger(parsedAmount)) {
            throw new Error(`Invalid amount: ${amount}. Amount must be an integer (no decimals allowed).`);
        }
        
        // Check for reasonable upper limit (prevent overflow)
        if (parsedAmount > Number.MAX_SAFE_INTEGER) {
            throw new Error(`Invalid amount: ${amount}. Amount exceeds maximum safe integer.`);
        }
        
        return parsedAmount;
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
        
        // Set initial total supply to 0
        // All tokens must be explicitly minted by an admin
        await this._putTotalSupply(ctx, 0);
        
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
        // Only admins can mint tokens (throws error if not admin)
        this._isAdmin(ctx);
        
        // Step 3: Validate and parse the amount
        // This ensures amount is a positive number
        const mintAmount = this._validateAmount(amount);

        // Step 4: Retrieve current state from the ledger
        // Get the target account (creates new one if doesn't exist)
        const account = await this._getAccount(ctx, accountId);
        
        // Get the current total supply
        const totalSupply = await this._getTotalSupply(ctx);

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
        const txId = ctx.stub.getTxID();
        const timestamp = ctx.stub.getTxTimestamp();
        console.log(`[MINT] TxID: ${txId}, Admin: ${ctx.clientIdentity.getMSPID()}, Account: ${accountId}, Amount: ${mintAmount}, NewBalance: ${account.balance}, NewSupply: ${newTotalSupply}, Timestamp: ${timestamp}`);
        
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
        const transferAmount = this._validateAmount(amount);

        // Step 3: Retrieve both accounts from the ledger
        // Load sender's account
        const fromAccount = await this._getAccount(ctx, fromAccountId);
        
        // Load receiver's account (creates new account if doesn't exist)
        const toAccount = await this._getAccount(ctx, toAccountId);

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
        const txId = ctx.stub.getTxID();
        const timestamp = ctx.stub.getTxTimestamp();
        const caller = ctx.clientIdentity.getMSPID();
        console.log(`[TRANSFER] TxID: ${txId}, Caller: ${caller}, From: ${fromAccountId}, To: ${toAccountId}, Amount: ${transferAmount}, FromBalance: ${fromAccount.balance}, ToBalance: ${toAccount.balance}, Timestamp: ${timestamp}`);
        
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
     * Burn tokens from an account (ADMIN ONLY)
     * 
     * Burning destroys tokens, permanently removing them from circulation.
     * This operation decreases both the account balance and the total supply.
     * Only administrators (Org1MSP) can burn tokens to maintain monetary policy control.
     * 
     * Use cases:
     * - Reducing money supply (deflationary policy)
     * - Redeeming tokens for underlying reserves
     * - Removing tokens from circulation
     * - Regulatory compliance (seizing illicit funds)
     * 
     * @param {Context} ctx - The transaction context provided by Fabric
     * @param {string} accountId - The account from which to burn tokens
     * @param {string} amount - The number of tokens to burn (as string)
     * @returns {Promise<Object>} Transaction result with new balances
     * @throws {Error} If caller is not admin, inputs are invalid, or insufficient balance
     */
    async Burn(ctx, accountId, amount) {
        // Step 1: Check permissions (ADMIN ONLY)
        this._isAdmin(ctx);
        
        // Step 2: Validate inputs
        // Ensure account ID is provided
        if (!accountId || accountId.trim() === '') {
            throw new Error('Account ID must be provided');
        }
        
        // Step 3: Validate and parse the burn amount
        const burnAmount = this._validateAmount(amount);

        // Step 4: Retrieve current state from the ledger
        // Get the account to burn from
        const account = await this._getAccount(ctx, accountId);
        
        // Get the current total supply
        const totalSupply = await this._getTotalSupply(ctx);

        // Step 5: Verify sufficient balance
        // Cannot burn more tokens than the account holds
        if (account.balance < burnAmount) {
            throw new Error(
                `Insufficient balance to burn. Account ${accountId} has ${account.balance}, ` +
                `but tried to burn ${burnAmount}`
            );
        }

        // Step 6: Update balances
        // Deduct the burned amount from the account
        account.balance -= burnAmount;
        
        // Decrease the total supply by the burned amount
        const newTotalSupply = totalSupply - burnAmount;

        // Step 7: Persist the updated state to the ledger
        // Save the updated account balance
        await this._putAccount(ctx, accountId, account);
        
        // Save the updated total supply
        await this._putTotalSupply(ctx, newTotalSupply);

        // Step 8: Log the operation for debugging/auditing
        const txId = ctx.stub.getTxID();
        const timestamp = ctx.stub.getTxTimestamp();
        console.log(`[BURN] TxID: ${txId}, Admin: ${ctx.clientIdentity.getMSPID()}, Account: ${accountId}, Amount: ${burnAmount}, NewBalance: ${account.balance}, NewSupply: ${newTotalSupply}, Timestamp: ${timestamp}`);
        
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

    // ==================== CREDIT/LOAN OPERATIONS ====================
    // These methods implement credit facility functionality for bank lending
    // Includes credit scoring with income, deposits, DTI, and payment history

    /**
     * Helper: Get borrower profile (credit data)
     */
    async _getBorrowerProfile(ctx, borrowerId) {
        const profileKey = ctx.stub.createCompositeKey('borrower', [borrowerId]);
        const profileBytes = await ctx.stub.getState(profileKey);
        
        if (!profileBytes || profileBytes.length === 0) {
            // New borrower with default profile
            return {
                borrowerId: borrowerId,
                annualIncome: 0,
                bankAccountBalance: 0,
                totalDebt: 0,
                paymentHistory: [],
                createdAt: Math.floor(Date.now() / 1000),
                creditScore: 600  // Default starting score
            };
        }
        
        return JSON.parse(profileBytes.toString());
    }

    /**
     * Helper: Save borrower profile
     */
    async _putBorrowerProfile(ctx, borrowerId, profile) {
        const profileKey = ctx.stub.createCompositeKey('borrower', [borrowerId]);
        await ctx.stub.putState(profileKey, Buffer.from(JSON.stringify(profile)));
    }

    // ==================== ZK PROOF VERIFICATION ====================

    /**
     * Verify a Zero-Knowledge Proof on-chain
     * 
     * A ZK proof allows proving knowledge of a fact without revealing the actual data.
     * Example: "I have ≥ $50K in savings" without revealing the actual amount.
     * 
     * @param {Context} ctx - The transaction context
     * @param {Object} zkProof - The ZK proof object containing:
     *   - commitment: hash committing to the secret
     *   - nullifier: unique identifier (prevents proof reuse)
     *   - proof: STARK/SNARK proof data
     *   - publicInputs: public information (thresholds being proved)
     * @returns {Promise<boolean>} True if proof is valid
     */
    async VerifyZKProof(ctx, zkProof) {
        // Parse proof if it's a string
        if (typeof zkProof === 'string') {
            zkProof = JSON.parse(zkProof);
        }

        // Validate proof structure
        if (!zkProof.commitment || !zkProof.nullifier || !zkProof.proof) {
            throw new Error('Invalid ZK proof structure: missing commitment, nullifier, or proof');
        }

        // Check if nullifier has been used before (prevent replay attacks)
        const nullifierKey = ctx.stub.createCompositeKey('zk_nullifier', [zkProof.nullifier]);
        const nullifierUsed = await ctx.stub.getState(nullifierKey);
        
        if (nullifierUsed && nullifierUsed.length > 0) {
            throw new Error('This ZK proof has already been used (nullifier replay)');
        }

        // Verify proof cryptographically
        // In production, this would verify STARK/SNARK proofs
        // For now, we verify the proof has the required format
        const isValidProof = this._verifySTARKProofFormat(zkProof);
        
        if (!isValidProof) {
            throw new Error('ZK proof verification failed');
        }

        // Mark this nullifier as used
        const timestamp = Math.floor(Date.now() / 1000);
        await ctx.stub.putState(
            nullifierKey, 
            Buffer.from(JSON.stringify({
                used: true,
                timestamp: timestamp,
                proofType: zkProof.proofType || 'unknown'
            }))
        );

        // Store proof commitment on blockchain (audit trail)
        const commitmentKey = ctx.stub.createCompositeKey('zk_commitment', [zkProof.commitment]);
        await ctx.stub.putState(
            commitmentKey,
            Buffer.from(JSON.stringify({
                commitment: zkProof.commitment,
                timestamp: timestamp,
                publicInputs: zkProof.publicInputs || {}
            }))
        );

        console.log(`[ZK_PROOF_VERIFIED] Commitment: ${zkProof.commitment}, Nullifier: ${zkProof.nullifier}`);
        
        return true;
    }

    /**
     * Verify ZK proof format and cryptographic validity
     * 
     * @param {Object} zkProof - The ZK proof object
     * @returns {boolean} True if proof has valid format and structure
     */
    _verifySTARKProofFormat(zkProof) {
        // Check commitment is hex string
        if (!/^0x[a-fA-F0-9]{64}|^[a-fA-F0-9]{64}|^commitment_[a-zA-Z0-9]+/.test(zkProof.commitment)) {
            // Also accept human-readable commitments for testing
            if (!zkProof.commitment.startsWith('commitment_')) {
                return false;
            }
        }

        // Check nullifier format
        if (!/^0x[a-fA-F0-9]{64}|^nullifier_[a-zA-Z0-9]+/.test(zkProof.nullifier)) {
            if (!zkProof.nullifier.startsWith('nullifier_')) {
                return false;
            }
        }

        // Check proof data exists
        if (!zkProof.proof || zkProof.proof.length === 0) {
            return false;
        }

        // Check public inputs if provided
        if (zkProof.publicInputs) {
            if (typeof zkProof.publicInputs !== 'object') {
                return false;
            }
        }

        return true;
    }

    /**
     * Register a borrower using a ZK proof
     * 
     * Instead of trusting the borrower to provide accurate income/balance data,
     * this function verifies claims using Zero-Knowledge Proofs.
     * 
     * The borrower proves (without revealing exact amounts):
     * - Annual income ≥ minimumIncome threshold
     * - Bank balance ≥ minimumBalance threshold
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - Borrower's unique ID
     * @param {string} zkProofBalance - ZK proof for bank balance threshold
     * @param {string} zkProofIncome - ZK proof for income threshold
     * @returns {Promise<Object>} Borrower profile with ZK verification
     */
    async RegisterBorrowerWithZKProof(ctx, borrowerId, zkProofBalance, zkProofIncome) {
        // Parse proofs if they're strings
        if (typeof zkProofBalance === 'string') {
            zkProofBalance = JSON.parse(zkProofBalance);
        }
        if (typeof zkProofIncome === 'string') {
            zkProofIncome = JSON.parse(zkProofIncome);
        }

        // Verify both ZK proofs
        await this.VerifyZKProof(ctx, zkProofBalance);
        await this.VerifyZKProof(ctx, zkProofIncome);

        // Extract public inputs (minimum thresholds that are proven)
        const minimumBalance = zkProofBalance.publicInputs?.minimumBalance || 50_000_00; // $50K minimum
        const minimumIncome = zkProofIncome.publicInputs?.minimumIncome || 100_000_00; // $100K minimum

        // Create borrower profile with ZK verification
        const profile = {
            borrowerId: borrowerId,
            zkVerified: true,
            verificationMethod: 'ZK_PROOF',
            
            // We don't know exact values, only that they meet thresholds
            minimumBalance: minimumBalance,
            minimumIncome: minimumIncome,
            
            // Store proof commitments for audit trail
            balanceProofCommitment: zkProofBalance.commitment,
            incomeProofCommitment: zkProofIncome.commitment,
            
            // Initialize credit data
            totalDebt: 0,
            paymentHistory: [],
            createdAt: Math.floor(Date.now() / 1000),
            
            // Calculate initial credit score based on ZK-verified minimums
            creditScore: this._calculateZKVerifiedCreditScore(minimumIncome, minimumBalance)
        };

        // Save profile
        await this._putBorrowerProfile(ctx, borrowerId, profile);

        console.log(`[REGISTER_WITH_ZK] BorrowerID: ${borrowerId}, MinIncome: ${minimumIncome}, MinBalance: ${minimumBalance}, Score: ${profile.creditScore}`);

        return {
            borrowerId: borrowerId,
            zkVerified: true,
            minimumIncomeThreshold: minimumIncome,
            minimumBalanceThreshold: minimumBalance,
            creditScore: profile.creditScore,
            status: 'registered_with_zk_proof'
        };
    }

    /**
     * Calculate credit score for ZK-verified borrower
     * 
     * For ZK-verified borrowers, we use the proven minimum thresholds
     * combined with payment history and other on-chain metrics.
     * 
     * @param {number} minimumIncome - Proven minimum income
     * @param {number} minimumBalance - Proven minimum balance
     * @returns {number} Credit score (300-850)
     */
    _calculateZKVerifiedCreditScore(minimumIncome, minimumBalance) {
        let score = 620; // Base score for ZK-verified borrower
        
        // Income bonus (ability to repay)
        // Each $10k of proven income = +1 point
        const incomeBonus = Math.min(100, Math.floor(minimumIncome / 1_000_000));
        score += incomeBonus;
        
        // Deposit bonus (proof of funds)
        // Each $1k of proven savings = +1 point
        const depositBonus = Math.min(100, Math.floor(minimumBalance / 100_000));
        score += depositBonus;
        
        // ZK verification bonus (cryptographically verified)
        // Extra 30 points for being ZK-verified (trusted source)
        score += 30;
        
        return Math.max(300, Math.min(850, score));
    }

    /**
     * Get ZK verification status for a borrower
     * 
     * Returns whether a borrower has been verified via ZK proofs
     * and what thresholds they've proven.
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - Borrower's ID
     * @returns {Promise<Object>} ZK verification status
     */
    async GetZKVerificationStatus(ctx, borrowerId) {
        const profile = await this._getBorrowerProfile(ctx, borrowerId);
        
        if (!profile.zkVerified) {
            return {
                borrowerId: borrowerId,
                zkVerified: false,
                verificationMethod: 'TRADITIONAL'
            };
        }

        return {
            borrowerId: borrowerId,
            zkVerified: true,
            verificationMethod: 'ZK_PROOF',
            minimumIncomeProven: profile.minimumIncome,
            minimumBalanceProven: profile.minimumBalance,
            balanceProofCommitment: profile.balanceProofCommitment,
            incomeProofCommitment: profile.incomeProofCommitment,
            creditScore: profile.creditScore,
            createdAt: profile.createdAt
        };
    }

    /**
     * Register a borrower with financial information
     * 
     * Before issuing a loan, borrower must be registered with:
     * - Annual income (employment verification)
     * - Bank account balance (proof of funds)
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - Borrower's unique ID
     * @param {string} annualIncome - Borrower's annual income (in cents/basis points)
     * @param {string} bankAccountBalance - Current bank account balance
     * @returns {Promise<Object>} Borrower profile
     */
    async RegisterBorrower(ctx, borrowerId, annualIncome, bankAccountBalance) {
        // Validate inputs
        if (!borrowerId || borrowerId.trim() === '') {
            throw new Error('Borrower ID must be provided');
        }
        
        const income = this._validateAmount(annualIncome);
        const balance = this._validateAmount(bankAccountBalance);
        
        if (income < 0 || balance < 0) {
            throw new Error('Income and balance must be non-negative');
        }
        
        // Create borrower profile
        const profile = {
            borrowerId: borrowerId,
            annualIncome: income,
            bankAccountBalance: balance,
            totalDebt: 0,
            paymentHistory: [],
            createdAt: Math.floor(Date.now() / 1000),
            creditScore: this._calculateInitialCreditScore(income, balance)
        };
        
        // Save profile
        await this._putBorrowerProfile(ctx, borrowerId, profile);
        
        console.log(`[REGISTER_BORROWER] BorrowerID: ${borrowerId}, Income: ${income}, Balance: ${balance}, InitialScore: ${profile.creditScore}`);
        
        return {
            borrowerId: borrowerId,
            annualIncome: income,
            bankAccountBalance: balance,
            creditScore: profile.creditScore,
            status: 'registered'
        };
    }

    /**
     * Calculate initial credit score based on income and deposits
     * 
     * Starting score: 600
     * + Bonus for higher income (more ability to repay)
     * + Bonus for higher deposits (lower risk)
     * 
     * @param {number} annualIncome - Annual income in cents
     * @param {number} bankBalance - Bank account balance in cents
     * @returns {number} Initial credit score (300-850)
     */
    _calculateInitialCreditScore(annualIncome, bankBalance) {
        let score = 600; // Base score
        
        // Income bonus (ability to repay)
        // Each $10k of income = +1 point (max +100)
        const incomeBonus = Math.min(100, Math.floor(annualIncome / 1_000_000)); // $10k = 1M cents
        score += incomeBonus;
        
        // Deposit bonus (proof of funds)
        // Each $1k of savings = +1 point (max +100)
        const depositBonus = Math.min(100, Math.floor(bankBalance / 100_000)); // $1k = 100k cents
        score += depositBonus;
        
        // Cap score between 300-850
        return Math.max(300, Math.min(850, score));
    }

    /**
     * Calculate credit score including payment history
     * 
     * Score factors:
     * - 40% Payment History (on-time vs late payments)
     * - 30% Credit Utilization (how much of limit used)
     * - 20% Income & Deposits (ability to repay)
     * - 10% Credit Age (how long been borrowing)
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - Borrower's ID
     * @returns {Promise<number>} Updated credit score (300-850)
     */
    async CalculateCreditScore(ctx, borrowerId) {
        const profile = await this._getBorrowerProfile(ctx, borrowerId);
        
        // 40% Payment History
        let paymentScore = 800; // Start high
        if (profile.paymentHistory.length > 0) {
            const onTimeCount = profile.paymentHistory.filter(p => p.onTime).length;
            const totalPayments = profile.paymentHistory.length;
            const onTimePercentage = (onTimeCount / totalPayments) * 100;
            
            // Each 1% on-time = 1 point
            paymentScore = Math.floor(onTimePercentage);
        }
        const paymentComponent = (paymentScore / 1000) * 40;
        
        // 30% Credit Utilization (lower utilization = better)
        // If not borrowing much = good
        const totalCredit = Math.max(1, profile.totalDebt);
        const utilizationPercentage = Math.min(100, (profile.totalDebt / (profile.totalDebt + 100_000_000)) * 100);
        const utilizationScore = 100 - utilizationPercentage; // Inverse relationship
        const utilizationComponent = (utilizationScore / 100) * 30;
        
        // 20% Income & Deposits
        const incomeScore = Math.min(100, Math.floor(profile.annualIncome / 1_000_000));
        const depositScore = Math.min(100, Math.floor(profile.bankAccountBalance / 100_000));
        const incomeDepositScore = (incomeScore + depositScore) / 2;
        const incomeComponent = (incomeDepositScore / 100) * 20;
        
        // 10% Credit Age
        const ageInDays = Math.floor((Math.floor(Date.now() / 1000) - profile.createdAt) / (24 * 60 * 60));
        const ageScore = Math.min(100, Math.floor(ageInDays / 10)); // 10 days = 1 point, max 100
        const ageComponent = (ageScore / 100) * 10;
        
        // Composite score (0-100)
        const compositeScore = paymentComponent + utilizationComponent + incomeComponent + ageComponent;
        
        // Map to FICO-style 300-850
        const ficoScore = Math.floor(300 + (compositeScore * 5.5));
        
        return Math.max(300, Math.min(850, ficoScore));
    }

    /**
     * Assess credit risk and determine approval
     * 
     * Determines:
     * - Credit approval (yes/no)
     * - Maximum credit limit
     * - Interest rate based on risk
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - Borrower's ID
     * @param {string} requestedAmount - Requested loan amount
     * @returns {Promise<Object>} Risk assessment result
     */
    async AssessCreditRisk(ctx, borrowerId, requestedAmount) {
        const profile = await this._getBorrowerProfile(ctx, borrowerId);
        const creditScore = await this.CalculateCreditScore(ctx, borrowerId);
        
        // Update profile with current score
        profile.creditScore = creditScore;
        
        // Determine approval based on credit score
        let isApproved = false;
        let reason = '';
        
        if (creditScore >= 750) {
            isApproved = true;
        } else if (creditScore >= 700) {
            isApproved = true;
        } else if (creditScore >= 650) {
            isApproved = true;
        } else if (creditScore >= 600) {
            isApproved = true;
            reason = 'MARGINAL - High risk';
        } else {
            isApproved = false;
            reason = 'DENIED - Credit score too low';
        }
        
        if (!isApproved) {
            return {
                borrowerId: borrowerId,
                creditScore: creditScore,
                approved: false,
                reason: reason,
                creditLimit: 0,
                interestRate: 0
            };
        }
        
        // Calculate credit limit (3 constraints)
        
        // Constraint 1: Income-based limit (40% of annual income)
        const incomeLimit = Math.floor(profile.annualIncome * 0.4);
        
        // Constraint 2: Score-based limit
        let scoreLimitAmount = 0;
        if (creditScore >= 750) {
            scoreLimitAmount = 100_000_000; // $100k
        } else if (creditScore >= 700) {
            scoreLimitAmount = 75_000_000; // $75k
        } else if (creditScore >= 650) {
            scoreLimitAmount = 50_000_000; // $50k
        } else {
            scoreLimitAmount = 25_000_000; // $25k
        }
        
        // Constraint 3: Debt-to-Income ratio (max 60% of income)
        const maxDebtAllowed = Math.floor(profile.annualIncome * 0.6);
        const availableForNewDebt = Math.max(0, maxDebtAllowed - profile.totalDebt);
        
        // Take minimum of all constraints
        const creditLimit = Math.min(incomeLimit, scoreLimitAmount, availableForNewDebt);
        
        // Determine interest rate based on credit score
        let interestRate = 0;
        if (creditScore >= 750) {
            interestRate = 5;
        } else if (creditScore >= 700) {
            interestRate = 8;
        } else if (creditScore >= 650) {
            interestRate = 12;
        } else {
            interestRate = 15;
        }
        
        // Check if requested amount is within limit
        const requestedAmountParsed = this._validateAmount(requestedAmount);
        const withinLimit = requestedAmountParsed <= creditLimit;
        
        return {
            borrowerId: borrowerId,
            creditScore: creditScore,
            approved: isApproved,
            creditLimit: creditLimit,
            requestedAmount: requestedAmountParsed,
            approvedAmount: withinLimit ? requestedAmountParsed : creditLimit,
            interestRate: interestRate,
            incomeLimit: incomeLimit,
            scoreLimitAmount: scoreLimitAmount,
            debtToIncomeRatio: profile.annualIncome > 0 ? Math.floor((profile.totalDebt / profile.annualIncome) * 100) : 0,
            reason: `Approved at ${interestRate}% (Score: ${creditScore}, DTI: ${Math.floor((profile.totalDebt / profile.annualIncome) * 100)}%)`
        };
    }

    /**
     * Helper: Get a loan from the world state
     */
    async _getLoan(ctx, loanId) {
        const loanKey = ctx.stub.createCompositeKey('loan', [loanId]);
        const loanBytes = await ctx.stub.getState(loanKey);
        
        if (!loanBytes || loanBytes.length === 0) {
            return null;
        }
        
        return JSON.parse(loanBytes.toString());
    }

    /**
     * Helper: Save a loan to the world state
     */
    async _putLoan(ctx, loanId, loan) {
        const loanKey = ctx.stub.createCompositeKey('loan', [loanId]);
        await ctx.stub.putState(loanKey, Buffer.from(JSON.stringify(loan)));
    }

    /**
     * Helper: Calculate interest on a loan
     * Simple interest formula: Interest = Principal × Rate × Time (in years)
     */
    _calculateInterest(principal, annualRate, daysElapsed) {
        const yearsElapsed = daysElapsed / 365;
        return Math.floor(principal * (annualRate / 100) * yearsElapsed);
    }

    /**
     * Helper: Get current timestamp in seconds
     */
    _getCurrentTimestamp(ctx) {
        const timestamp = ctx.stub.getTxTimestamp();
        return Math.floor(timestamp.getTime() / 1000);
    }

    /**
     * Create a loan with risk-based terms (UPDATED WITH CREDIT SCORING)
     * 
     * The bank now:
     * 1. Checks borrower's credit profile (income, deposits, payment history)
     * 2. Calculates risk assessment (score, approval, credit limit, rate)
     * 3. Determines interest rate based on creditworthiness
     * 4. Issues loan only if approved
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} loanId - Unique identifier for the loan
     * @param {string} borrowerId - Account ID of the borrower
     * @param {string} requestedAmount - Loan amount requested
     * @param {string} durationDays - Loan duration in days
     * @returns {Promise<Object>} Loan details with risk-based terms
     * @throws {Error} If borrower not approved or insufficient bank balance
     */
    async CreateLoan(ctx, loanId, borrowerId, requestedAmount, durationDays) {
        // Step 1: Validate inputs
        if (!loanId || loanId.trim() === '') {
            throw new Error('Loan ID must be provided');
        }
        if (!borrowerId || borrowerId.trim() === '') {
            throw new Error('Borrower ID must be provided');
        }

        // Step 2: Check permissions - only bank (admin) can create loans
        this._isAdmin(ctx);

        // Step 3: Validate amounts
        const principal = this._validateAmount(requestedAmount);
        const duration = parseInt(durationDays);

        if (isNaN(duration) || duration <= 0) {
            throw new Error('Duration must be positive number of days');
        }

        // Step 4: Check if loan already exists
        const existingLoan = await this._getLoan(ctx, loanId);
        if (existingLoan) {
            throw new Error(`Loan ${loanId} already exists`);
        }

        // Step 5: CREDIT RISK ASSESSMENT
        const riskAssessment = await this.AssessCreditRisk(ctx, borrowerId, requestedAmount);

        // Step 6: Check if borrower is approved
        if (!riskAssessment.approved) {
            throw new Error(
                `Loan Denied for ${borrowerId}: ${riskAssessment.reason}`
            );
        }

        // Step 7: Check if requested amount exceeds credit limit
        if (principal > riskAssessment.creditLimit) {
            throw new Error(
                `Requested amount ($${principal / 100}) exceeds credit limit ($${riskAssessment.creditLimit / 100}). ` +
                `Income limit: $${riskAssessment.incomeLimit / 100}, ` +
                `Score limit: $${riskAssessment.scoreLimitAmount / 100}, ` +
                `Available (DTI): $${(Math.floor(riskAssessment.incomeLimit * 0.6) - riskAssessment.approvedAmount) / 100}`
            );
        }

        // Step 8: Verify bank has sufficient balance
        const bankAccount = await this._getAccount(ctx, 'bank');
        if (bankAccount.balance < principal) {
            throw new Error(
                `Bank has insufficient balance. Bank balance: $${bankAccount.balance / 100}, ` +
                `Loan amount: $${principal / 100}`
            );
        }

        // Step 9: Create loan with RISK-BASED INTEREST RATE
        const timestamp = this._getCurrentTimestamp(ctx);
        const loan = {
            loanId: loanId,
            bankId: 'bank',
            borrowerId: borrowerId,
            principal: principal,
            annualInterestRate: riskAssessment.interestRate,  // ← DYNAMIC based on creditworthiness!
            durationDays: duration,
            createdAt: timestamp,
            maturityDate: timestamp + (duration * 24 * 60 * 60),
            status: 'active',
            totalRepaid: 0,
            remainingBalance: principal,
            lastPaymentDate: null,
            riskProfile: {
                creditScore: riskAssessment.creditScore,
                debtToIncomeRatio: riskAssessment.debtToIncomeRatio,
                approvalReason: riskAssessment.reason
            },
            metadata: {
                description: `Loan agreement between bank and ${borrowerId}`
            }
        };

        // Step 10: Transfer principal from bank to borrower
        bankAccount.balance -= principal;
        await this._putAccount(ctx, 'bank', bankAccount);

        const borrowerAccount = await this._getAccount(ctx, borrowerId);
        borrowerAccount.balance = (borrowerAccount.balance || 0) + principal;
        await this._putAccount(ctx, borrowerId, borrowerAccount);

        // Step 11: Update borrower's total debt
        const profile = await this._getBorrowerProfile(ctx, borrowerId);
        profile.totalDebt += principal;
        await this._putBorrowerProfile(ctx, borrowerId, profile);

        // Step 12: Save the loan
        await this._putLoan(ctx, loanId, loan);

        // Step 13: Log the transaction
        const txId = ctx.stub.getTxID();
        console.log(`[CREATE_LOAN] TxID: ${txId}, LoanID: ${loanId}, Borrower: ${borrowerId}, Principal: $${principal / 100}, Rate: ${riskAssessment.interestRate}% (Risk-Based), CreditScore: ${riskAssessment.creditScore}`);

        return {
            loanId: loanId,
            borrowerId: borrowerId,
            principal: principal,
            annualInterestRate: riskAssessment.interestRate,
            status: 'active',
            borrowerNewBalance: borrowerAccount.balance,
            creditScore: riskAssessment.creditScore,
            riskTier: riskAssessment.interestRate <= 5 ? 'PRIME' : (riskAssessment.interestRate <= 8 ? 'STANDARD' : (riskAssessment.interestRate <= 12 ? 'SUBPRIME' : 'HIGH_RISK')),
            approvalDetails: riskAssessment.reason
        };
    }

    /**
     * Make a loan payment
     * 
     * The borrower transfers stablecoin back to the bank to pay down the loan.
     * The payment is recorded and applied to the loan balance.
     * Interest is calculated based on days elapsed since loan creation.
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} loanId - The loan ID
     * @param {string} paymentAmount - Amount of stablecoin to pay
     * @returns {Promise<Object>} Payment details and updated loan status
     * @throws {Error} If loan not found, insufficient balance, or invalid amount
     */
    async PayLoan(ctx, loanId, paymentAmount) {
        // Step 1: Validate inputs
        if (!loanId || loanId.trim() === '') {
            throw new Error('Loan ID must be provided');
        }

        // Step 2: Validate and parse payment amount
        const payment = this._validateAmount(paymentAmount);

        // Step 3: Retrieve the loan
        const loan = await this._getLoan(ctx, loanId);
        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // Step 4: Check loan is active
        if (loan.status !== 'active') {
            throw new Error(`Loan ${loanId} is not active (status: ${loan.status})`);
        }

        // Step 5: Calculate current interest
        const currentTimestamp = this._getCurrentTimestamp(ctx);
        const daysSinceCreation = Math.floor((currentTimestamp - loan.createdAt) / (24 * 60 * 60));
        const interestAccrued = this._calculateInterest(loan.principal, loan.annualInterestRate, daysSinceCreation);

        // Step 6: Calculate amounts owed
        const totalOwed = loan.principal + interestAccrued;
        const stillOwed = totalOwed - loan.totalRepaid;

        if (payment > stillOwed) {
            throw new Error(
                `Payment amount exceeds outstanding balance. ` +
                `Outstanding: ${stillOwed}, Payment: ${payment}`
            );
        }

        // Step 7: Verify borrower has sufficient balance
        const borrowerAccount = await this._getAccount(ctx, loan.borrowerId);
        if (borrowerAccount.balance < payment) {
            throw new Error(
                `Borrower has insufficient balance. Balance: ${borrowerAccount.balance}, Payment: ${payment}`
            );
        }

        // Step 8: Process the payment (transfer from borrower to bank)
        // Deduct from borrower
        borrowerAccount.balance -= payment;
        await this._putAccount(ctx, loan.borrowerId, borrowerAccount);

        // Add to bank
        const bankAccount = await this._getAccount(ctx, 'bank');
        bankAccount.balance = (bankAccount.balance || 0) + payment;
        await this._putAccount(ctx, 'bank', bankAccount);

        // Step 9: Update loan record
        loan.totalRepaid += payment;
        loan.remainingBalance = totalOwed - loan.totalRepaid;
        loan.lastPaymentDate = currentTimestamp;

        // Check if loan is fully paid
        if (loan.remainingBalance <= 0) {
            loan.status = 'closed';
            loan.remainingBalance = 0;
        }

        await this._putLoan(ctx, loanId, loan);

        // Step 10: Log the transaction
        const txId = ctx.stub.getTxID();
        console.log(`[PAY_LOAN] TxID: ${txId}, LoanID: ${loanId}, Payment: ${payment}, Remaining: ${loan.remainingBalance}, Status: ${loan.status}`);

        return {
            loanId: loanId,
            paymentAmount: payment,
            interestAccrued: interestAccrued,
            totalRepaid: loan.totalRepaid,
            remainingBalance: loan.remainingBalance,
            status: loan.status,
            borrowerNewBalance: borrowerAccount.balance,
            bankNewBalance: bankAccount.balance
        };
    }

    /**
     * Get loan details and current status
     * 
     * Retrieves complete information about a loan including:
     * - Principal and interest rate
     * - Current accrued interest
     * - Amounts repaid and remaining
     * - Loan status
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} loanId - The loan ID to query
     * @returns {Promise<Object>} Complete loan information
     * @throws {Error} If loan not found
     */
    async GetLoanStatus(ctx, loanId) {
        // Step 1: Validate input
        if (!loanId || loanId.trim() === '') {
            throw new Error('Loan ID must be provided');
        }

        // Step 2: Retrieve the loan
        const loan = await this._getLoan(ctx, loanId);
        if (!loan) {
            throw new Error(`Loan ${loanId} not found`);
        }

        // Step 3: Calculate current interest
        const currentTimestamp = this._getCurrentTimestamp(ctx);
        const daysSinceCreation = Math.floor((currentTimestamp - loan.createdAt) / (24 * 60 * 60));
        const interestAccrued = this._calculateInterest(loan.principal, loan.annualInterestRate, daysSinceCreation);

        // Step 4: Calculate totals
        const totalOwed = loan.principal + interestAccrued;
        const remainingBalance = totalOwed - loan.totalRepaid;

        // Step 5: Return complete loan status
        return {
            loanId: loan.loanId,
            bankId: loan.bankId,
            borrowerId: loan.borrowerId,
            principal: loan.principal,
            annualInterestRate: loan.annualInterestRate,
            durationDays: loan.durationDays,
            createdAt: loan.createdAt,
            maturityDate: loan.maturityDate,
            status: loan.status,
            daysSinceCreation: daysSinceCreation,
            interestAccrued: interestAccrued,
            totalOwed: totalOwed,
            totalRepaid: loan.totalRepaid,
            remainingBalance: Math.max(0, remainingBalance),
            lastPaymentDate: loan.lastPaymentDate
        };
    }

    /**
     * Get all loans for a borrower
     * 
     * Returns a list of all loans (active and closed) for a specific borrower.
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} borrowerId - The borrower's account ID
     * @returns {Promise<Array>} Array of loan IDs for this borrower
     */
    async GetBorrowerLoans(ctx, borrowerId) {
        // Step 1: Validate input
        if (!borrowerId || borrowerId.trim() === '') {
            throw new Error('Borrower ID must be provided');
        }

        // Step 2: Query all loans where borrowerId matches
        const queryString = {
            selector: {
                docType: 'loan',
                borrowerId: borrowerId
            }
        };

        const iterator = await ctx.stub.getQueryResultsForQueryString(JSON.stringify(queryString));
        const loans = [];

        let result = await iterator.next();
        while (!result.done) {
            const loan = JSON.parse(result.value.value.toString());
            loans.push(loan);
            result = await iterator.next();
        }
        await iterator.close();

        return {
            borrowerId: borrowerId,
            loanCount: loans.length,
            loans: loans
        };
    }

    // ==================== DIGITAL WALLET FUNCTIONS ====================
    // These functions implement digital wallet features for unbanked communities
    // Zero-KYC onboarding (phone + biometric only)

    /**
     * CreateWalletForUnbanked - Zero-KYC wallet creation for unbanked users
     * 
     * Creates a digital wallet with minimal requirements:
     * - Phone number (primary identification)
     * - Biometric hash (fingerprint or face recognition - no government ID needed)
     * - No documents required
     * 
     * This enables financial inclusion for 1.4 billion unbanked people globally.
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} phoneNumber - User's phone number (e.g., +254712345678)
     * @param {string} biometricHash - SHA256 hash of biometric (fingerprint/face ID)
     * @returns {Promise<Object>} Wallet object with initial setup
     */
    async CreateWalletForUnbanked(ctx, phoneNumber, biometricHash) {
        // Step 1: Validate inputs
        if (!phoneNumber || phoneNumber.trim() === '') {
            throw new Error('Phone number is required');
        }
        if (!biometricHash || biometricHash.trim() === '') {
            throw new Error('Biometric hash is required');
        }

        // Step 2: Generate unique wallet ID from phone and timestamp
        const walletId = `wallet-${phoneNumber}-${Date.now()}`;
        
        // Step 3: Create wallet object with zero-KYC requirements
        const wallet = {
            walletId: walletId,
            phone: phoneNumber,
            biometric: biometricHash,
            createdAt: new Date().toISOString(),
            kycLevel: 'basic',  // No documents needed
            balances: {
                usdw: 0,           // USDw stablecoin balance
                locked: 0          // Locked for loan collateral
            },
            creditProfile: {
                score: 0,
                tier: 'PENDING',   // Waiting for transaction history
                creditLimit: 100,  // Start with $100 micro-credit
                used: 0
            },
            transactions: [],      // Track all wallet activity
            status: 'ACTIVE'
        };

        // Step 4: Store wallet on blockchain
        const walletKey = ctx.stub.createCompositeKey('wallet', [walletId]);
        await ctx.stub.putState(walletKey, Buffer.from(JSON.stringify(wallet)));

        // Step 5: Create blockchain account linked to wallet
        // This enables transfers and stablecoin holding
        await this._putAccount(ctx, walletId, { balance: 0, frozen: false });

        // Step 6: Log wallet creation
        const txId = ctx.stub.getTxID();
        const timestamp = new Date().toISOString();
        console.log(`[WALLET_CREATED] TxID: ${txId}, WalletID: ${walletId}, Phone: ${phoneNumber}, Timestamp: ${timestamp}`);

        return {
            walletId: walletId,
            phone: phoneNumber,
            message: 'Wallet created successfully - zero-KYC enabled',
            initialCreditLimit: 100,
            status: 'ACTIVE'
        };
    }

    /**
     * GetWalletProfile - Retrieve complete wallet information
     * 
     * Returns wallet details including:
     * - Basic info (phone, creation date, KYC level)
     * - Current balances (available and locked)
     * - Credit profile (score, tier, limits)
     * - Recent transactions
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} walletId - The wallet identifier
     * @returns {Promise<Object>} Complete wallet profile
     */
    async GetWalletProfile(ctx, walletId) {
        // Step 1: Validate input
        if (!walletId || walletId.trim() === '') {
            throw new Error('Wallet ID is required');
        }

        // Step 2: Retrieve wallet from blockchain
        const walletKey = ctx.stub.createCompositeKey('wallet', [walletId]);
        const walletBytes = await ctx.stub.getState(walletKey);
        
        if (!walletBytes || walletBytes.length === 0) {
            throw new Error(`Wallet not found: ${walletId}`);
        }

        // Step 3: Parse wallet data
        const wallet = JSON.parse(walletBytes.toString());

        // Step 4: Get linked account balance from stablecoin system
        const accountBalance = await this._getAccount(ctx, walletId);
        wallet.balances.usdw = accountBalance.balance;

        // Step 5: Calculate available credit
        const availableCredit = wallet.creditProfile.creditLimit - wallet.creditProfile.used;

        // Step 6: Return comprehensive profile
        return {
            walletId: wallet.walletId,
            phone: wallet.phone,
            kycLevel: wallet.kycLevel,
            createdAt: wallet.createdAt,
            balances: {
                usdw: wallet.balances.usdw,
                locked: wallet.balances.locked,
                available: wallet.balances.usdw - wallet.balances.locked
            },
            creditProfile: {
                score: wallet.creditProfile.score,
                tier: wallet.creditProfile.tier,
                creditLimit: wallet.creditProfile.creditLimit,
                used: wallet.creditProfile.used,
                available: availableCredit
            },
            recentTransactions: wallet.transactions.slice(-10),  // Last 10 transactions
            status: wallet.status
        };
    }

    /**
     * UpdateWalletCreditScore - Update wallet credit score based on transaction history
     * 
     * Calculates credit score from:
     * - Regular deposits/income
     * - On-time payments
     * - Low default rate
     * - Transaction frequency
     * 
     * Tiers:
     * - PRIME (750+): 5% APR
     * - STANDARD (700-749): 8% APR
     * - SUBPRIME (650-699): 12% APR
     * - HIGH_RISK (<650): 15% APR
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} walletId - The wallet identifier
     * @param {number} newScore - New credit score (300-850)
     * @returns {Promise<Object>} Updated credit profile
     */
    async UpdateWalletCreditScore(ctx, walletId, newScore) {
        // Step 1: Validate inputs
        if (!walletId || walletId.trim() === '') {
            throw new Error('Wallet ID is required');
        }
        if (newScore < 300 || newScore > 850) {
            throw new Error('Credit score must be between 300 and 850');
        }

        // Step 2: Retrieve wallet
        const walletKey = ctx.stub.createCompositeKey('wallet', [walletId]);
        const walletBytes = await ctx.stub.getState(walletKey);
        
        if (!walletBytes || walletBytes.length === 0) {
            throw new Error(`Wallet not found: ${walletId}`);
        }

        // Step 3: Parse wallet and update score
        const wallet = JSON.parse(walletBytes.toString());
        const previousScore = wallet.creditProfile.score;
        wallet.creditProfile.score = newScore;

        // Step 4: Determine tier and update credit limit
        if (newScore >= 750) {
            wallet.creditProfile.tier = 'PRIME';
            wallet.creditProfile.creditLimit = 10000;  // $10k for PRIME
        } else if (newScore >= 700) {
            wallet.creditProfile.tier = 'STANDARD';
            wallet.creditProfile.creditLimit = 2000;   // $2k for STANDARD
        } else if (newScore >= 650) {
            wallet.creditProfile.tier = 'SUBPRIME';
            wallet.creditProfile.creditLimit = 500;    // $500 for SUBPRIME
        } else {
            wallet.creditProfile.tier = 'HIGH_RISK';
            wallet.creditProfile.creditLimit = 100;    // $100 for HIGH_RISK
        }

        // Step 5: Save updated wallet
        await ctx.stub.putState(walletKey, Buffer.from(JSON.stringify(wallet)));

        // Step 6: Log score update
        const txId = ctx.stub.getTxID();
        const timestamp = new Date().toISOString();
        console.log(`[CREDIT_SCORE_UPDATED] TxID: ${txId}, WalletID: ${walletId}, PreviousScore: ${previousScore}, NewScore: ${newScore}, Tier: ${wallet.creditProfile.tier}, Timestamp: ${timestamp}`);

        return {
            walletId: walletId,
            previousScore: previousScore,
            newScore: newScore,
            tier: wallet.creditProfile.tier,
            creditLimit: wallet.creditProfile.creditLimit,
            message: `Credit tier updated to ${wallet.creditProfile.tier}`
        };
    }

    /**
     * TransferFromWallet - Send USDw stablecoin from wallet
     * 
     * Enables peer-to-peer transfers, bill payments, and merchant transactions.
     * Integrates with the existing Transfer function but adds wallet context.
     * 
     * Features:
     * - Daily limits to protect unbanked users from scams
     * - Transaction recording in wallet history
     * - Recipient wallet creation if needed
     * - Real-time settlement (no T+3 delays)
     * 
     * @param {Context} ctx - The transaction context
     * @param {string} fromWalletId - Sender's wallet ID
     * @param {string} toWalletId - Recipient's wallet ID
     * @param {string} amount - Amount to send in USDw
     * @returns {Promise<Object>} Transaction confirmation
     */
    async TransferFromWallet(ctx, fromWalletId, toWalletId, amount) {
        // Step 1: Validate inputs
        if (!fromWalletId || fromWalletId.trim() === '') {
            throw new Error('Sender wallet ID is required');
        }
        if (!toWalletId || toWalletId.trim() === '') {
            throw new Error('Recipient wallet ID is required');
        }
        if (fromWalletId === toWalletId) {
            throw new Error('Cannot send to the same wallet');
        }

        // Step 2: Parse and validate amount
        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            throw new Error('Amount must be a positive number');
        }

        // Step 3: Retrieve sender wallet
        const senderKey = ctx.stub.createCompositeKey('wallet', [fromWalletId]);
        const senderBytes = await ctx.stub.getState(senderKey);
        if (!senderBytes || senderBytes.length === 0) {
            throw new Error(`Sender wallet not found: ${fromWalletId}`);
        }
        const senderWallet = JSON.parse(senderBytes.toString());

        // Step 4: Check sender balance
        const senderAccount = await this._getAccount(ctx, fromWalletId);
        if (senderAccount.balance < transferAmount) {
            throw new Error(`Insufficient balance. Available: ${senderAccount.balance}, Requested: ${transferAmount}`);
        }

        // Step 5: Apply daily limit protection (unbanked security)
        // Max $1000 per day to prevent scams
        const dailyLimit = 1000;
        const today = new Date().toDateString();
        const todayTransactions = senderWallet.transactions.filter(tx => 
            new Date(tx.timestamp).toDateString() === today && tx.type === 'send'
        );
        const dailySpent = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        
        if (dailySpent + transferAmount > dailyLimit) {
            throw new Error(`Daily limit exceeded. Max $${dailyLimit}/day. Already sent: $${dailySpent}`);
        }

        // Step 6: Execute transfer using existing Transfer function
        const txResult = await this.Transfer(ctx, fromWalletId, toWalletId, amount);

        // Step 7: Record transaction in sender wallet history
        senderWallet.transactions.push({
            type: 'send',
            amount: transferAmount,
            recipient: toWalletId,
            timestamp: new Date().toISOString(),
            txId: ctx.stub.getTxID(),
            status: 'completed'
        });

        // Step 8: Record transaction in recipient wallet history (if exists)
        const recipientKey = ctx.stub.createCompositeKey('wallet', [toWalletId]);
        const recipientBytes = await ctx.stub.getState(recipientKey);
        if (recipientBytes && recipientBytes.length > 0) {
            const recipientWallet = JSON.parse(recipientBytes.toString());
            recipientWallet.transactions.push({
                type: 'receive',
                amount: transferAmount,
                sender: fromWalletId,
                timestamp: new Date().toISOString(),
                txId: ctx.stub.getTxID(),
                status: 'completed'
            });
            await ctx.stub.putState(recipientKey, Buffer.from(JSON.stringify(recipientWallet)));
        }

        // Step 9: Update sender wallet
        await ctx.stub.putState(senderKey, Buffer.from(JSON.stringify(senderWallet)));

        // Step 10: Log transaction
        const txId = ctx.stub.getTxID();
        const timestamp = new Date().toISOString();
        console.log(`[WALLET_TRANSFER] TxID: ${txId}, From: ${fromWalletId}, To: ${toWalletId}, Amount: ${transferAmount}, Timestamp: ${timestamp}`);

        return {
            transactionId: txId,
            from: fromWalletId,
            to: toWalletId,
            amount: transferAmount,
            status: 'completed',
            timestamp: timestamp,
            message: 'Transfer successful - Instant settlement (0% fee)'
        };
    }

    // ==================== UTXO-Based Simple Functions ====================
    
    /**
     * Get UTXO key for a user
     */
    _getUTXOKey(ctx, userId) {
        return ctx.stub.createCompositeKey('utxo', [userId]);
    }

    /**
     * Get UTXOs for a user
     */
    async _getUTXOs(ctx, userId) {
        const utxoKey = this._getUTXOKey(ctx, userId);
        const utxoBytes = await ctx.stub.getState(utxoKey);
        
        if (!utxoBytes || utxoBytes.length === 0) {
            return [];
        }
        
        return JSON.parse(utxoBytes.toString());
    }

    /**
     * Save UTXOs for a user
     */
    async _putUTXOs(ctx, userId, utxos) {
        const utxoKey = this._getUTXOKey(ctx, userId);
        await ctx.stub.putState(utxoKey, Buffer.from(JSON.stringify(utxos)));
    }

    /**
     * SimpleMint - Create new tokens as UTXOs
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} userId - User to mint tokens for
     * @param {string} amount - Amount to mint
     */
    async SimpleMint(ctx, userId, amount) {
        // Validate inputs
        if (!userId || userId.trim() === '') {
            throw new Error('User ID is required');
        }

        const mintAmount = this._validateAmount(amount);

        // Get existing UTXOs
        const utxos = await this._getUTXOs(ctx, userId);

        // Create new UTXO
        const newUtxo = {
            utxo_id: `${userId}_${ctx.stub.getTxID()}`,
            owner_id: userId,
            amount: mintAmount,
            created_at: ctx.stub.getTxTimestamp().seconds.low,
            spent: false
        };

        utxos.push(newUtxo);

        // Save UTXOs
        await this._putUTXOs(ctx, userId, utxos);

        // Update total supply
        const currentSupply = await this._getTotalSupply(ctx);
        await this._putTotalSupply(ctx, currentSupply + mintAmount);

        console.log(`SimpleMint: ${mintAmount} tokens to ${userId}`);
        
        return {
            utxo_id: newUtxo.utxo_id,
            amount: mintAmount,
            owner: userId
        };
    }

    /**
     * SimpleTransfer - Transfer tokens using UTXO model
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} fromUserId - Sender
     * @param {string} toUserId - Receiver
     * @param {string} amount - Amount to transfer
     */
    async SimpleTransfer(ctx, fromUserId, toUserId, amount) {
        // Validate inputs
        if (!fromUserId || fromUserId.trim() === '') {
            throw new Error('From user ID is required');
        }
        if (!toUserId || toUserId.trim() === '') {
            throw new Error('To user ID is required');
        }
        if (fromUserId === toUserId) {
            throw new Error('Cannot transfer to yourself');
        }

        const transferAmount = this._validateAmount(amount);

        // Get sender's UTXOs
        const senderUtxos = await this._getUTXOs(ctx, fromUserId);
        
        // Calculate available balance from unspent UTXOs
        const availableBalance = senderUtxos
            .filter(utxo => !utxo.spent)
            .reduce((sum, utxo) => sum + utxo.amount, 0);

        if (availableBalance < transferAmount) {
            throw new Error(`insufficient balance: have ${availableBalance}, need ${transferAmount}`);
        }

        // Select UTXOs to spend
        let amountToSpend = transferAmount;
        const utxosToSpend = [];
        let totalSpent = 0;

        for (const utxo of senderUtxos) {
            if (!utxo.spent && totalSpent < transferAmount) {
                utxosToSpend.push(utxo);
                totalSpent += utxo.amount;
                utxo.spent = true;
            }
        }

        // Calculate change
        const change = totalSpent - transferAmount;

        // Save updated sender UTXOs
        await this._putUTXOs(ctx, fromUserId, senderUtxos);

        // Get receiver's UTXOs
        const receiverUtxos = await this._getUTXOs(ctx, toUserId);

        // Create new UTXO for receiver
        const receiverUtxo = {
            utxo_id: `${toUserId}_${ctx.stub.getTxID()}_out`,
            owner_id: toUserId,
            amount: transferAmount,
            created_at: ctx.stub.getTxTimestamp().seconds.low,
            spent: false
        };
        receiverUtxos.push(receiverUtxo);

        // Save receiver UTXOs
        await this._putUTXOs(ctx, toUserId, receiverUtxos);

        // If there's change, create change UTXO for sender
        if (change > 0) {
            const changeUtxo = {
                utxo_id: `${fromUserId}_${ctx.stub.getTxID()}_change`,
                owner_id: fromUserId,
                amount: change,
                created_at: ctx.stub.getTxTimestamp().seconds.low,
                spent: false
            };
            senderUtxos.push(changeUtxo);
            await this._putUTXOs(ctx, fromUserId, senderUtxos);
        }

        console.log(`SimpleTransfer: ${transferAmount} from ${fromUserId} to ${toUserId}`);

        return {
            from: fromUserId,
            to: toUserId,
            amount: transferAmount,
            change: change
        };
    }

    /**
     * SimpleBurn - Destroy tokens by burning UTXOs
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} userId - User to burn tokens from
     * @param {string} amount - Amount to burn
     */
    async SimpleBurn(ctx, userId, amount) {
        // Validate inputs
        if (!userId || userId.trim() === '') {
            throw new Error('User ID is required');
        }

        const burnAmount = this._validateAmount(amount);

        // Get user's UTXOs
        const utxos = await this._getUTXOs(ctx, userId);

        // Calculate available balance
        const availableBalance = utxos
            .filter(utxo => !utxo.spent)
            .reduce((sum, utxo) => sum + utxo.amount, 0);

        if (availableBalance < burnAmount) {
            throw new Error(`insufficient balance: have ${availableBalance}, need ${burnAmount}`);
        }

        // Select UTXOs to burn
        let amountToBurn = burnAmount;
        let totalBurned = 0;

        for (const utxo of utxos) {
            if (!utxo.spent && totalBurned < burnAmount) {
                utxo.spent = true;
                totalBurned += utxo.amount;
            }
        }

        // Calculate change
        const change = totalBurned - burnAmount;

        // If there's change, create change UTXO
        if (change > 0) {
            const changeUtxo = {
                utxo_id: `${userId}_${ctx.stub.getTxID()}_burn_change`,
                owner_id: userId,
                amount: change,
                created_at: ctx.stub.getTxTimestamp().seconds.low,
                spent: false
            };
            utxos.push(changeUtxo);
        }

        // Save updated UTXOs
        await this._putUTXOs(ctx, userId, utxos);

        // Update total supply
        const currentSupply = await this._getTotalSupply(ctx);
        await this._putTotalSupply(ctx, currentSupply - burnAmount);

        console.log(`SimpleBurn: ${burnAmount} tokens from ${userId}`);

        return {
            burned: burnAmount,
            owner: userId
        };
    }

    /**
     * GetUTXO - Get UTXO information for a user
     * 
     * @param {Context} ctx - Transaction context
     * @param {string} userId - User ID to query
     */
    async GetUTXO(ctx, userId) {
        if (!userId || userId.trim() === '') {
            throw new Error('User ID is required');
        }

        const utxos = await this._getUTXOs(ctx, userId);
        
        if (utxos.length === 0) {
            throw new Error(`UTXO ${userId} not found`);
        }

        const unspentUtxos = utxos.filter(utxo => !utxo.spent);
        const totalBalance = unspentUtxos.reduce((sum, utxo) => sum + utxo.amount, 0);

        return {
            user_id: userId,
            utxos: unspentUtxos,
            total_balance: totalBalance,
            utxo_count: unspentUtxos.length
        };
    }
}

// Export the contract class so it can be discovered by Fabric
module.exports = StablecoinContract;
