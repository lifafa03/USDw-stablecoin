'use strict';

/**
 * FabricClient - Hyperledger Fabric Node SDK v2.x Integration
 * 
 * This class provides a high-level interface for interacting with
 * Hyperledger Fabric networks using the Node.js SDK v2.x.
 * 
 * Key Components:
 * - Gateway: Entry point for accessing the Fabric network
 * - Wallet: Secure storage for user identities (X.509 certificates)
 * - Connection Profile: Network topology and configuration
 * 
 * Architecture:
 * 1. Load connection profile (network topology)
 * 2. Initialize file system wallet
 * 3. Connect gateway with user identity
 * 4. Access channel and chaincode
 * 5. Submit/evaluate transactions
 * 
 * @class FabricClient
 */

const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const fs = require('fs');
const path = require('path');

class FabricClient {
    constructor() {
        // Gateway instance - provides access to the Fabric network
        this.gateway = null;
        
        // Wallet instance - manages user identities
        this.wallet = null;
        
        // Network configuration
        this.channelName = 'mychannel';           // Channel name (must match deployment)
        this.chaincodeName = 'stablecoincc';      // Chaincode name (must match deployment)
        this.orgName = 'Org1';                    // Organization name
        this.mspId = 'Org1MSP';                   // MSP identifier for Org1
        this.userId = 'appUser';                  // Application user identity
        
        // Connection profile path (relative to this file)
        this.connectionProfilePath = path.resolve(
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
        
        // Wallet storage path
        this.walletPath = path.join(__dirname, 'wallet');
    }

    /**
     * Build the Common Connection Profile (CCP)
     * 
     * The connection profile is a JSON file that describes:
     * - Network topology (peers, orderers, CAs)
     * - TLS certificates for secure communication
     * - Channel configurations
     * - Service endpoints (URLs and ports)
     * 
     * Format follows the Fabric SDK connection profile specification.
     * In production, this would be provided by the network operator.
     * 
     * @returns {Object} Parsed connection profile
     * @throws {Error} If connection profile not found
     */
    buildCCP() {
        // Verify connection profile exists
        if (!fs.existsSync(this.connectionProfilePath)) {
            throw new Error(
                `Connection profile not found at ${this.connectionProfilePath}\n` +
                `Please ensure the Fabric test-network is running and has been initialized.`
            );
        }

        // Read and parse the JSON connection profile
        const ccpJSON = fs.readFileSync(this.connectionProfilePath, 'utf8');
        const ccp = JSON.parse(ccpJSON);
        
        console.log(`Connection profile loaded from: ${this.connectionProfilePath}`);
        
        return ccp;
    }

    /**
     * Build the Certificate Authority (CA) client
     * 
     * The CA is responsible for:
     * - Issuing X.509 certificates for identities
     * - Registering new users
     * - Enrolling users (generating crypto materials)
     * - Revoking certificates
     * 
     * Each organization typically runs its own CA for managing
     * member identities within that organization.
     * 
     * @param {Object} ccp - Connection profile
     * @returns {FabricCAServices} CA client instance
     * @throws {Error} If CA configuration is invalid
     */
    buildCAClient(ccp) {
        // Extract CA information from connection profile
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        
        if (!caInfo) {
            throw new Error('CA configuration not found in connection profile');
        }
        
        // Get TLS CA certificates for secure communication with CA
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        
        // Create CA client instance
        // - URL: CA service endpoint
        // - trustedRoots: TLS certificates to verify CA identity
        // - verify: Whether to verify TLS certificates (false for dev, true for prod)
        const caClient = new FabricCAServices(
            caInfo.url,
            { trustedRoots: caTLSCACerts, verify: false },
            caInfo.caName
        );

        console.log(`✓ CA client created: ${caInfo.caName} at ${caInfo.url}`);
        return caClient;
    }

    /**
     * Initialize the file system wallet
     * 
     * The wallet is a secure storage for user identities (X.509 certificates).
     * Each identity consists of:
     * - Public certificate (signed by the CA)
     * - Private key (kept secret)
     * - MSP ID (organization identifier)
     * 
     * Fabric SDK supports multiple wallet implementations:
     * - FileSystemWallet: Stores on disk (used here)
     * - InMemoryWallet: Stores in memory (for testing)
     * - CouchDBWallet: Stores in database (for production)
     * 
     * @returns {Promise<void>}
     */
    async initWallet() {
        // Create/access the file system wallet
        // This creates a 'wallet' directory if it doesn't exist
        this.wallet = await Wallets.newFileSystemWallet(this.walletPath);
        console.log(`✓ Wallet initialized at: ${this.walletPath}`);
    }

    /**
     * Enroll the admin user
     * 
     * The admin user has special privileges:
     * - Can register new users with the CA
     * - Has organization-level permissions
     * 
     * Enrollment process:
     * 1. Submit enrollment request with ID and secret
     * 2. CA verifies credentials
     * 3. CA issues signed certificate and private key
     * 4. Store identity in wallet
     * 
     * Note: The admin credentials (admin/adminpw) are bootstrap
     * credentials created when the CA is initialized.
     * 
     * @returns {Promise<void>}
     */
    async enrollAdmin() {
        const ccp = this.buildCCP();
        const caClient = this.buildCAClient(ccp);

        // Check if admin identity already exists in wallet
        const identity = await this.wallet.get('admin');
        if (identity) {
            console.log('✓ Admin identity already exists in wallet');
            return;
        }

        console.log('Enrolling admin user...');
        
        // Enroll admin with bootstrap credentials
        // These credentials are set when the CA is first started
        const enrollment = await caClient.enroll({
            enrollmentID: 'admin',           // Admin username
            enrollmentSecret: 'adminpw'      // Admin password
        });

        // Create X.509 identity object
        // X.509 is the standard format for public key certificates
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,       // Signed public certificate
                privateKey: enrollment.key.toBytes(),     // Private key (keep secret!)
            },
            mspId: this.mspId,                            // Organization identifier
            type: 'X.509',                                 // Identity type
        };

        // Store admin identity in wallet
        await this.wallet.put('admin', x509Identity);
        console.log('✓ Admin user enrolled and imported to wallet');
    }

    /**
     * Register and enroll an application user
     * 
     * Application users are client identities that can:
     * - Submit transactions to chaincode
     * - Query chaincode state
     * - Listen to chaincode events
     * 
     * Registration process (2-step):
     * 1. Register: Admin registers user with CA, receives enrollment secret
     * 2. Enroll: User presents secret to CA, receives certificate
     * 
     * This two-step process allows:
     * - Admin control over who can join the network
     * - Secure distribution of credentials
     * 
     * User attributes can include:
     * - Affiliation: Organizational hierarchy
     * - Role: client, peer, orderer, admin
     * - Custom attributes: For attribute-based access control (ABAC)
     * 
     * @returns {Promise<void>}
     * @throws {Error} If registration or enrollment fails
     */
    async registerUser() {
        const ccp = this.buildCCP();
        const caClient = this.buildCAClient(ccp);

        // Check if user identity already exists in wallet
        const userIdentity = await this.wallet.get(this.userId);
        if (userIdentity) {
            console.log(`✓ Identity for user '${this.userId}' already exists in wallet`);
            return;
        }

        console.log(`Registering user '${this.userId}'...`);

        // Ensure admin identity exists (required for registration)
        const adminIdentity = await this.wallet.get('admin');
        if (!adminIdentity) {
            console.log('Admin identity not found. Enrolling admin first...');
            await this.enrollAdmin();
        }

        // Get admin user context from wallet
        // This is needed to sign the registration request
        const provider = this.wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Step 1: Register the user with the CA
        // The CA validates the admin's signature and creates a new user record
        // Returns: enrollment secret (password for enrollment)
        const secret = await caClient.register(
            {
                affiliation: 'org1.department1',   // Organizational unit (hierarchical)
                enrollmentID: this.userId,         // Username
                role: 'client'                     // User type (client, peer, orderer, admin)
            },
            adminUser                             // Admin signing the registration
        );

        console.log(`User '${this.userId}' registered with enrollment secret`);

        // Step 2: Enroll the user
        // User presents the enrollment secret to receive certificates
        const enrollment = await caClient.enroll({
            enrollmentID: this.userId,
            enrollmentSecret: secret
        });

        // Create X.509 identity from enrollment materials
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: this.mspId,
            type: 'X.509',
        };

        // Store user identity in wallet
        await this.wallet.put(this.userId, x509Identity);
        console.log(`✓ User '${this.userId}' enrolled and imported to wallet`);
    }

    /**
     * Connect to the Fabric network using Gateway
     * 
     * The Gateway is the main entry point for applications to interact
     * with a Fabric network. It provides:
     * - Simplified API for transaction submission
     * - Automatic peer selection for endorsements
     * - Service discovery for dynamic network topology
     * - Connection pooling and management
     * 
     * Connection process:
     * 1. Initialize wallet (identity storage)
     * 2. Ensure application user is enrolled
     * 3. Load connection profile (network topology)
     * 4. Connect gateway with user identity
     * 
     * Service Discovery:
     * - Automatically discovers peers and orderers
     * - Selects optimal peers for endorsement
     * - Handles failover if peers are unavailable
     * - Must be enabled with 'asLocalhost: true' for local development
     * 
     * @returns {Promise<void>}
     * @throws {Error} If connection fails
     */
    async connect() {
        try {
            console.log('Connecting to Fabric network...');
            
            // Step 1: Initialize wallet
            await this.initWallet();

            // Step 2: Ensure user identity exists
            const userIdentity = await this.wallet.get(this.userId);
            if (!userIdentity) {
                console.log(`User '${this.userId}' not found in wallet. Registering...`);
                await this.registerUser();
            } else {
                console.log(`✓ User '${this.userId}' found in wallet`);
            }

            // Step 3: Load connection profile
            const ccp = this.buildCCP();

            // Step 4: Create and connect gateway
            this.gateway = new Gateway();
            
            // Gateway connection options:
            await this.gateway.connect(ccp, {
                wallet: this.wallet,                    // Wallet containing identities
                identity: this.userId,                  // Identity to use for transactions
                discovery: {                            // Service discovery configuration
                    enabled: true,                      // Enable service discovery
                    asLocalhost: true                   // Map discovered addresses to localhost
                                                        // (required for Docker networks)
                }
            });

            console.log('✓ Successfully connected to Fabric network');
            console.log(`  Channel: ${this.channelName}`);
            console.log(`  Chaincode: ${this.chaincodeName}`);
            console.log(`  Identity: ${this.userId} (${this.mspId})`);
            
        } catch (error) {
            console.error('✗ Failed to connect to Fabric network');
            console.error(`  Error: ${error.message}`);
            throw new Error(`Fabric connection failed: ${error.message}`);
        }
    }

    /**
     * Get the chaincode contract instance
     * 
     * Contract represents a deployed chaincode instance on a specific channel.
     * Through the contract, you can:
     * - Submit transactions (write to ledger)
     * - Evaluate transactions (read from ledger)
     * - Listen to chaincode events
     * 
     * Hierarchy:
     * Gateway → Network (channel) → Contract (chaincode)
     * 
     * @returns {Promise<Contract>} Contract instance for submitting transactions
     * @throws {Error} If gateway not connected or contract not found
     */
    async getContract() {
        // Ensure gateway is connected
        if (!this.gateway) {
            console.log('Gateway not connected. Connecting now...');
            await this.connect();
        }

        // Get the network (channel) from the gateway
        // This represents a specific channel in the Fabric network
        const network = await this.gateway.getNetwork(this.channelName);
        
        // Get the contract (chaincode) from the network
        // This returns a Contract object for interacting with the chaincode
        const contract = network.getContract(this.chaincodeName);
        
        return contract;
    }

    /**
     * Submit a transaction (for write operations)
     * 
     * Submit Transaction Flow:
     * 1. SDK sends proposal to endorsing peers
     * 2. Peers execute chaincode in isolated environment
     * 3. Peers return endorsements (signed results)
     * 4. SDK verifies endorsement policy is satisfied
     * 5. SDK submits endorsed transaction to orderer
     * 6. Orderer creates block and broadcasts to peers
     * 7. Peers validate and commit block to ledger
     * 8. SDK receives commit notification
     * 
     * Use submitTransaction for operations that modify the ledger:
     * - Mint, Transfer, Burn
     * - Any state-changing operation
     * 
     * @param {string} functionName - Chaincode function to invoke
     * @param {...string} args - Function arguments
     * @returns {Promise<Object>} Transaction result from chaincode
     * @throws {Error} If transaction fails at any step
     */
    async submitTransaction(functionName, ...args) {
        try {
            console.log(`Submitting transaction: ${functionName}(${args.join(', ')})`);
            
            const contract = await this.getContract();
            
            // submitTransaction handles the complete transaction lifecycle
            // It returns when the transaction is committed to the ledger
            const result = await contract.submitTransaction(functionName, ...args);
            
            // Parse the result (chaincode returns JSON strings)
            const parsedResult = JSON.parse(result.toString());
            
            console.log(`✓ Transaction ${functionName} submitted successfully`);
            
            return parsedResult;
            
        } catch (error) {
            // Enhanced error logging for debugging
            console.error(`✗ Failed to submit transaction: ${functionName}`);
            console.error(`  Arguments: ${args.join(', ')}`);
            console.error(`  Error: ${error.message}`);
            
            // Extract meaningful error message from Fabric errors
            const errorMessage = this.extractErrorMessage(error);
            throw new Error(errorMessage);
        }
    }

    /**
     * Evaluate a transaction (for read-only operations)
     * 
     * Evaluate Transaction Flow:
     * 1. SDK sends query to a single peer
     * 2. Peer executes chaincode in read-only mode
     * 3. Peer returns result (no ledger modification)
     * 4. SDK receives result immediately
     * 
     * Differences from submitTransaction:
     * - No endorsement required (faster)
     * - No ordering step (cheaper)
     * - No ledger write (read-only)
     * - Can query any peer (doesn't need consensus)
     * 
     * Use evaluateTransaction for read operations:
     * - BalanceOf, TotalSupply
     * - Any query that doesn't modify state
     * 
     * @param {string} functionName - Chaincode function to query
     * @param {...string} args - Function arguments
     * @returns {Promise<Object>} Query result from chaincode
     * @throws {Error} If query fails
     */
    async evaluateTransaction(functionName, ...args) {
        try {
            console.log(`Evaluating transaction: ${functionName}(${args.join(', ')})`);
            
            const contract = await this.getContract();
            
            // evaluateTransaction sends query to a peer
            // Returns immediately with result (no ledger write)
            const result = await contract.evaluateTransaction(functionName, ...args);
            
            // Parse the result
            const parsedResult = JSON.parse(result.toString());
            
            console.log(`✓ Transaction ${functionName} evaluated successfully`);
            
            return parsedResult;
            
        } catch (error) {
            console.error(`✗ Failed to evaluate transaction: ${functionName}`);
            console.error(`  Arguments: ${args.join(', ')}`);
            console.error(`  Error: ${error.message}`);
            
            const errorMessage = this.extractErrorMessage(error);
            throw new Error(errorMessage);
        }
    }

    /**
     * Extract meaningful error message from Fabric errors
     * 
     * Fabric errors can be nested and verbose. This method:
     * - Extracts chaincode error messages
     * - Identifies common error patterns
     * - Provides user-friendly error descriptions
     * 
     * @param {Error} error - Original error from Fabric SDK
     * @returns {string} Cleaned error message
     */
    extractErrorMessage(error) {
        // If error has endorsement details, extract chaincode message
        if (error.endorsements && error.endorsements.length > 0) {
            const endorsement = error.endorsements[0];
            if (endorsement.message) {
                return endorsement.message;
            }
        }
        
        // Check for common error patterns
        const errorStr = error.message || error.toString();
        
        // MVCC conflict (concurrent modification)
        if (errorStr.includes('MVCC_READ_CONFLICT')) {
            return 'Transaction conflict detected. Please retry the operation.';
        }
        
        // Endorsement policy failure
        if (errorStr.includes('ENDORSEMENT_POLICY_FAILURE')) {
            return 'Transaction endorsement failed. Insufficient peer approvals.';
        }
        
        // Timeout
        if (errorStr.includes('timeout') || errorStr.includes('TIMEOUT')) {
            return 'Transaction timeout. The network may be slow or unavailable.';
        }
        
        // Return original message if no pattern matches
        return errorStr;
    }

    /**
     * Disconnect from the gateway
     * 
     * Properly closes the gateway connection and releases resources.
     * Should be called when shutting down the application.
     * 
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.gateway) {
            this.gateway.disconnect();
            console.log('✓ Disconnected from Fabric network');
        }
    }

    // ==================== Stablecoin Chaincode Operations ====================
    // High-level methods that wrap chaincode function calls

    /**
     * Mint tokens to an account
     * 
     * @param {string} accountId - Target account ID
     * @param {number} amount - Amount to mint
     * @returns {Promise<Object>} Transaction result
     */
    async mint(accountId, amount) {
        return await this.submitTransaction('Mint', accountId, amount.toString());
    }

    /**
     * Transfer tokens between accounts
     * 
     * @param {string} fromAccountId - Sender account ID
     * @param {string} toAccountId - Receiver account ID
     * @param {number} amount - Amount to transfer
     * @returns {Promise<Object>} Transaction result
     */
    async transfer(fromAccountId, toAccountId, amount) {
        return await this.submitTransaction('Transfer', fromAccountId, toAccountId, amount.toString());
    }

    /**
     * Burn tokens from an account
     * 
     * @param {string} accountId - Account ID to burn from
     * @param {number} amount - Amount to burn
     * @returns {Promise<Object>} Transaction result
     */
    async burn(accountId, amount) {
        return await this.submitTransaction('Burn', accountId, amount.toString());
    }

    /**
     * Query account balance
     * 
     * @param {string} accountId - Account ID to query
     * @returns {Promise<Object>} Account balance and status
     */
    async balanceOf(accountId) {
        return await this.evaluateTransaction('BalanceOf', accountId);
    }

    /**
     * Query total supply
     * 
     * @returns {Promise<Object>} Total supply information
     */
    async totalSupply() {
        return await this.evaluateTransaction('TotalSupply');
    }

    /**
     * Get account transaction history
     * 
     * @param {string} accountId - Account ID to query
     * @returns {Promise<Object>} Transaction history
     */
    async getAccountHistory(accountId) {
        return await this.evaluateTransaction('GetAccountHistory', accountId);
    }

    /**
     * Freeze an account
     * 
     * @param {string} accountId - Account ID to freeze
     * @returns {Promise<Object>} Transaction result
     */
    async freezeAccount(accountId) {
        return await this.submitTransaction('FreezeAccount', accountId);
    }

    /**
     * Unfreeze an account
     * 
     * @param {string} accountId - Account ID to unfreeze
     * @returns {Promise<Object>} Transaction result
     */
    async unfreezeAccount(accountId) {
        return await this.submitTransaction('UnfreezeAccount', accountId);
    }
}

module.exports = FabricClient;
