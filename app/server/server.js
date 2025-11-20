'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const FabricClient = require('./fabric-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Fabric client
const fabricClient = new FabricClient();

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Error handler middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==================== Routes ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mint tokens
app.post('/mint', asyncHandler(async (req, res) => {
    const { accountId, amount } = req.body;

    if (!accountId || !amount) {
        return res.status(400).json({
            error: 'Missing required fields: accountId and amount'
        });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({
            error: 'Amount must be a positive number'
        });
    }

    const result = await fabricClient.mint(accountId, parseFloat(amount));
    res.json({
        success: true,
        data: result
    });
}));

// Transfer tokens
app.post('/transfer', asyncHandler(async (req, res) => {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
        return res.status(400).json({
            error: 'Missing required fields: from, to, and amount'
        });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({
            error: 'Amount must be a positive number'
        });
    }

    const result = await fabricClient.transfer(from, to, parseFloat(amount));
    res.json({
        success: true,
        data: result
    });
}));

// Burn tokens
app.post('/burn', asyncHandler(async (req, res) => {
    const { accountId, amount } = req.body;

    if (!accountId || !amount) {
        return res.status(400).json({
            error: 'Missing required fields: accountId and amount'
        });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({
            error: 'Amount must be a positive number'
        });
    }

    const result = await fabricClient.burn(accountId, parseFloat(amount));
    res.json({
        success: true,
        data: result
    });
}));

// Get balance
app.get('/balance/:accountId', asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({
            error: 'Account ID is required'
        });
    }

    const result = await fabricClient.balanceOf(accountId);
    res.json({
        success: true,
        data: result
    });
}));

// Get total supply
app.get('/totalsupply', asyncHandler(async (req, res) => {
    const result = await fabricClient.totalSupply();
    res.json({
        success: true,
        data: result
    });
}));

// Get account history
app.get('/history/:accountId', asyncHandler(async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({
            error: 'Account ID is required'
        });
    }

    const result = await fabricClient.getAccountHistory(accountId);
    res.json({
        success: true,
        data: result
    });
}));

// Freeze account
app.post('/freeze', asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    if (!accountId) {
        return res.status(400).json({
            error: 'Missing required field: accountId'
        });
    }

    const result = await fabricClient.freezeAccount(accountId);
    res.json({
        success: true,
        data: result
    });
}));

// Unfreeze account
app.post('/unfreeze', asyncHandler(async (req, res) => {
    const { accountId } = req.body;

    if (!accountId) {
        return res.status(400).json({
            error: 'Missing required field: accountId'
        });
    }

    const result = await fabricClient.unfreezeAccount(accountId);
    res.json({
        success: true,
        data: result
    });
}));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Extract meaningful error message
    let errorMessage = err.message || 'Internal server error';
    
    // Handle Fabric-specific errors
    if (err.message && err.message.includes('ENDORSEMENT_POLICY_FAILURE')) {
        errorMessage = 'Transaction endorsement failed. Check if you have the required permissions.';
    } else if (err.message && err.message.includes('MVCC_READ_CONFLICT')) {
        errorMessage = 'Transaction conflict. Please try again.';
    }

    res.status(err.status || 500).json({
        success: false,
        error: errorMessage
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
