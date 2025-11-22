'use strict';

/**
 * Stablecoin REST API Server
 * 
 * Express-based REST API for interacting with the Stablecoin chaincode
 * deployed on Hyperledger Fabric.
 * 
 * Architecture:
 * - Express: HTTP server framework
 * - FabricClient: Wrapper around Fabric Node SDK v2.x
 * - Body-parser: Parse JSON request bodies
 * - CORS: Enable cross-origin requests
 * - Morgan: HTTP request logging
 * 
 * Endpoints:
 * - POST   /mint              - Mint new tokens (admin only on chaincode side)
 * - POST   /transfer          - Transfer tokens between accounts
 * - POST   /burn              - Burn tokens from an account
 * - GET    /balance/:accountId - Query account balance
 * - GET    /totalsupply       - Query total supply
 * - GET    /history/:accountId - Get account transaction history
 * - POST   /freeze            - Freeze an account (admin only)
 * - POST   /unfreeze          - Unfreeze an account (admin only)
 * - GET    /health            - Health check endpoint
 * 
 * Error Handling:
 * - Input validation on all endpoints
 * - Fabric error extraction and user-friendly messages
 * - Proper HTTP status codes
 * - Detailed error logging
 * 
 * @module server
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const FabricClient = require('./fabric-client');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== Middleware Configuration ====================

// Enable CORS for all routes
// Allows frontend applications on different domains to call this API
app.use(cors());

// Parse JSON request bodies
// Automatically converts JSON payloads to JavaScript objects
app.use(bodyParser.json());

// Parse URL-encoded request bodies (for form submissions)
app.use(bodyParser.urlencoded({ extended: true }));

// HTTP request logging
// Logs: timestamp, method, URL, status, response time
app.use(morgan('combined'));

// ==================== Fabric Client Initialization ====================

// Create single FabricClient instance (reused across requests)
// This maintains a persistent connection to the Fabric network
const fabricClient = new FabricClient();

// ==================== Request Logging Middleware ====================

// Custom middleware to log incoming requests with details
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
    
    // Log request body for POST requests (exclude sensitive data if needed)
    if (req.method === 'POST' && Object.keys(req.body).length > 0) {
        console.log('Request Body:', JSON.stringify(req.body, null, 2));
    }
    
    next();
});

// ==================== Utility Functions ====================

/**
 * Async handler wrapper
 * 
 * Wraps async route handlers to automatically catch errors
 * and pass them to Express error handling middleware.
 * 
 * Without this, unhandled promise rejections would crash the server.
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped handler with error catching
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validate amount parameter
 * 
 * Ensures amount is:
 * - Present
 * - A valid number
 * - Positive
 * 
 * @param {*} amount - Amount to validate
 * @returns {Object} Validation result {valid: boolean, error: string}
 */
const validateAmount = (amount) => {
    if (amount === undefined || amount === null || amount === '') {
        return { valid: false, error: 'Amount is required' };
    }
    
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount)) {
        return { valid: false, error: 'Amount must be a valid number' };
    }
    
    if (numAmount <= 0) {
        return { valid: false, error: 'Amount must be positive' };
    }
    
    return { valid: true, value: numAmount };
};

/**
 * Validate account ID parameter
 * 
 * Ensures account ID is:
 * - Present
 * - Not empty string
 * - Valid format (alphanumeric with underscores/hyphens)
 * 
 * @param {string} accountId - Account ID to validate
 * @returns {Object} Validation result {valid: boolean, error: string}
 */
const validateAccountId = (accountId) => {
    if (!accountId || accountId.trim() === '') {
        return { valid: false, error: 'Account ID is required' };
    }
    
    // Optional: Add regex validation for account ID format
    // Example: only allow alphanumeric, underscore, hyphen
    const validFormat = /^[a-zA-Z0-9_-]+$/.test(accountId);
    if (!validFormat) {
        return { 
            valid: false, 
            error: 'Account ID must contain only letters, numbers, underscores, and hyphens' 
        };
    }
    
    return { valid: true };
};

// ==================== API Routes ====================

/**
 * Health check endpoint
 * 
 * Returns server status and basic information.
 * Useful for:
 * - Load balancer health checks
 * - Monitoring systems
 * - Verifying server is running
 * 
 * @route GET /health
 * @returns {200} Server is healthy
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Stablecoin REST API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * Mint tokens endpoint
 * 
 * Creates new tokens and adds them to the specified account.
 * 
 * Business rules (enforced by chaincode):
 * - Only admin (Org1MSP) can mint
 * - Amount must be positive
 * - Increases total supply
 * 
 * @route POST /mint
 * @body {string} accountId - Target account ID
 * @body {number} amount - Amount to mint
 * @returns {200} {success: true, data: {accountId, amount, newBalance, newTotalSupply}}
 * @returns {400} Invalid input
 * @returns {500} Fabric error
 */
app.post('/mint', asyncHandler(async (req, res) => {
    const { accountId, amount } = req.body;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: amountValidation.error
        });
    }

    // Submit mint transaction to chaincode
    const result = await fabricClient.mint(accountId, amountValidation.value);
    
    res.json({
        success: true,
        data: result,
        message: `Successfully minted ${amountValidation.value} tokens to ${accountId}`
    });
}));

/**
 * Transfer tokens endpoint
 * 
 * Transfers tokens from one account to another.
 * 
 * Business rules (enforced by chaincode):
 * - Sender must have sufficient balance
 * - Sender account must not be frozen
 * - Cannot transfer to same account
 * - Total supply remains unchanged
 * 
 * @route POST /transfer
 * @body {string} from - Sender account ID
 * @body {string} to - Receiver account ID
 * @body {number} amount - Amount to transfer
 * @returns {200} {success: true, data: {from, to, amount, fromBalance, toBalance}}
 * @returns {400} Invalid input
 * @returns {500} Fabric error (insufficient balance, frozen, etc.)
 */
app.post('/transfer', asyncHandler(async (req, res) => {
    const { from, to, amount } = req.body;

    // Validate sender account ID
    const fromValidation = validateAccountId(from);
    if (!fromValidation.valid) {
        return res.status(400).json({
            success: false,
            error: `Invalid 'from' account: ${fromValidation.error}`
        });
    }

    // Validate receiver account ID
    const toValidation = validateAccountId(to);
    if (!toValidation.valid) {
        return res.status(400).json({
            success: false,
            error: `Invalid 'to' account: ${toValidation.error}`
        });
    }

    // Check that from and to are different
    if (from === to) {
        return res.status(400).json({
            success: false,
            error: 'Cannot transfer to the same account'
        });
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: amountValidation.error
        });
    }

    // Submit transfer transaction to chaincode
    const result = await fabricClient.transfer(from, to, amountValidation.value);
    
    res.json({
        success: true,
        data: result,
        message: `Successfully transferred ${amountValidation.value} tokens from ${from} to ${to}`
    });
}));

/**
 * Burn tokens endpoint
 * 
 * Destroys tokens from an account, removing them from circulation.
 * 
 * Business rules (enforced by chaincode):
 * - Account must have sufficient balance
 * - Amount must be positive
 * - Decreases total supply
 * 
 * @route POST /burn
 * @body {string} accountId - Account to burn from
 * @body {number} amount - Amount to burn
 * @returns {200} {success: true, data: {accountId, amount, newBalance, newTotalSupply}}
 * @returns {400} Invalid input
 * @returns {500} Fabric error (insufficient balance, etc.)
 */
app.post('/burn', asyncHandler(async (req, res) => {
    const { accountId, amount } = req.body;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: amountValidation.error
        });
    }

    // Submit burn transaction to chaincode
    const result = await fabricClient.burn(accountId, amountValidation.value);
    
    res.json({
        success: true,
        data: result,
        message: `Successfully burned ${amountValidation.value} tokens from ${accountId}`
    });
}));

/**
 * Get balance endpoint
 * 
 * Queries the balance and status of an account.
 * Returns 0 balance if account doesn't exist.
 * 
 * Read-only operation (evaluateTransaction, not submitTransaction).
 * 
 * @route GET /balance/:accountId
 * @param {string} accountId - Account ID to query
 * @returns {200} {success: true, data: {accountId, balance, frozen}}
 * @returns {400} Invalid account ID
 * @returns {500} Fabric error
 */
app.get('/balance/:accountId', asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Query balance from chaincode
    const result = await fabricClient.balanceOf(accountId);
    
    res.json({
        success: true,
        data: result
    });
}));

/**
 * Get total supply endpoint
 * 
 * Queries the current total supply of tokens in circulation.
 * Total supply = sum of all minted tokens - sum of all burned tokens.
 * 
 * Read-only operation.
 * 
 * @route GET /totalsupply
 * @returns {200} {success: true, data: {totalSupply}}
 * @returns {500} Fabric error
 */
app.get('/totalsupply', asyncHandler(async (req, res) => {
    // Query total supply from chaincode
    const result = await fabricClient.totalSupply();
    
    res.json({
        success: true,
        data: result
    });
}));

/**
 * Get account history endpoint
 * 
 * Retrieves the complete transaction history for an account.
 * Uses Fabric's built-in history API.
 * 
 * Returns all historical states with timestamps and transaction IDs.
 * 
 * @route GET /history/:accountId
 * @param {string} accountId - Account ID to query
 * @returns {200} {success: true, data: {accountId, history: []}}
 * @returns {400} Invalid account ID
 * @returns {500} Fabric error
 */
app.get('/history/:accountId', asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Query account history from chaincode
    const result = await fabricClient.getAccountHistory(accountId);
    
    res.json({
        success: true,
        data: result
    });
}));

/**
 * Freeze account endpoint
 * 
 * Freezes an account, preventing it from making transfers.
 * 
 * Business rules (enforced by chaincode):
 * - Only admin (Org1MSP) can freeze accounts
 * - Frozen accounts can still receive tokens
 * - Used for compliance/regulatory purposes
 * 
 * @route POST /freeze
 * @body {string} accountId - Account to freeze
 * @returns {200} {success: true, data: {accountId, frozen, balance}}
 * @returns {400} Invalid input
 * @returns {500} Fabric error (permission denied, etc.)
 */
app.post('/freeze', asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Submit freeze transaction to chaincode
    const result = await fabricClient.freezeAccount(accountId);
    
    res.json({
        success: true,
        data: result,
        message: `Successfully froze account ${accountId}`
    });
}));

/**
 * Unfreeze account endpoint
 * 
 * Unfreezes a previously frozen account, allowing transfers again.
 * 
 * Business rules (enforced by chaincode):
 * - Only admin (Org1MSP) can unfreeze accounts
 * 
 * @route POST /unfreeze
 * @body {string} accountId - Account to unfreeze
 * @returns {200} {success: true, data: {accountId, frozen, balance}}
 * @returns {400} Invalid input
 * @returns {500} Fabric error (permission denied, etc.)
 */
app.post('/unfreeze', asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    // Validate account ID
    const accountValidation = validateAccountId(accountId);
    if (!accountValidation.valid) {
        return res.status(400).json({
            success: false,
            error: accountValidation.error
        });
    }

    // Submit unfreeze transaction to chaincode
    const result = await fabricClient.unfreezeAccount(accountId);
    
    res.json({
        success: true,
        data: result,
        message: `Successfully unfroze account ${accountId}`
    });
}));

// ==================== Error Handling ====================

/**
 * 404 handler for undefined routes
 * 
 * Catches all requests to undefined endpoints.
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Endpoint not found: ${req.method} ${req.path}`,
        availableEndpoints: [
            'GET  /health',
            'POST /mint',
            'POST /transfer',
            'POST /burn',
            'GET  /balance/:accountId',
            'GET  /totalsupply',
            'GET  /history/:accountId',
            'POST /freeze',
            'POST /unfreeze'
        ]
    });
});

/**
 * Global error handler
 * 
 * Catches all errors from route handlers and formats them consistently.
 * Logs detailed errors to console while sending user-friendly messages to client.
 * 
 * @param {Error} err - Error object
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
app.use((err, req, res, next) => {
    // Log full error details to console for debugging
    console.error('\n=== Error Details ===');
    console.error('Endpoint:', req.method, req.path);
    console.error('Error:', err.message);
    if (err.stack) {
        console.error('Stack:', err.stack);
    }
    console.error('====================\n');
    
    // Extract meaningful error message for client
    let errorMessage = err.message || 'Internal server error';
    let statusCode = err.status || 500;
    
    // Handle specific Fabric error patterns
    if (err.message) {
        // MVCC conflict (concurrent modification)
        if (err.message.includes('MVCC_READ_CONFLICT')) {
            errorMessage = 'Transaction conflict. Please retry the operation.';
            statusCode = 409; // Conflict
        }
        // Endorsement policy failure (permission issue)
        else if (err.message.includes('ENDORSEMENT_POLICY_FAILURE') || 
                 err.message.includes('admin')) {
            errorMessage = 'Permission denied. This operation requires admin privileges.';
            statusCode = 403; // Forbidden
        }
        // Insufficient balance
        else if (err.message.includes('Insufficient balance')) {
            statusCode = 400; // Bad Request
        }
        // Frozen account
        else if (err.message.includes('frozen')) {
            statusCode = 403; // Forbidden
        }
        // Timeout
        else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
            errorMessage = 'Request timeout. The network may be slow or unavailable.';
            statusCode = 504; // Gateway Timeout
        }
        // Network connection issues
        else if (err.message.includes('connection') || err.message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to Fabric network. Please ensure the network is running.';
            statusCode = 503; // Service Unavailable
        }
    }

    // Send error response to client
    res.status(statusCode).json({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
    });
});

// ==================== Server Initialization ====================

async function startServer() {
    try {
        console.log('Initializing Fabric connection...');
        await fabricClient.connect();
        console.log('Connected to Fabric network');

        app.listen(PORT, () => {
            console.log(`\n================================================`);
            console.log(`  Stablecoin REST API Server`);
            console.log(`================================================`);
            console.log(`Server running on port ${PORT}`);
            console.log(`\nAvailable endpoints:`);
            console.log(`  GET    /health`);
            console.log(`  POST   /mint              - { accountId, amount }`);
            console.log(`  POST   /transfer          - { from, to, amount }`);
            console.log(`  POST   /burn              - { accountId, amount }`);
            console.log(`  GET    /balance/:accountId`);
            console.log(`  GET    /totalsupply`);
            console.log(`  GET    /history/:accountId`);
            console.log(`  POST   /freeze            - { accountId }`);
            console.log(`  POST   /unfreeze          - { accountId }`);
            console.log(`================================================\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await fabricClient.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down server...');
    await fabricClient.disconnect();
    process.exit(0);
});

// Start the server
startServer();
