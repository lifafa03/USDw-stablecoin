'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const fs = require('fs');
const path = require('path');

class FabricClient {
    constructor() {
        this.gateway = null;
        this.wallet = null;
        this.channelName = 'mychannel';
        this.chaincodeName = 'stablecoin';
        this.orgName = 'Org1';
        this.mspId = 'Org1MSP';
        this.userId = 'appUser';
    }

    /**
     * Build the connection profile (CCP) from test-network files
     */
    buildCCP() {
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
     * Build the CA client
     */
    buildCAClient(ccp) {
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const caClient = new FabricCAServices(
            caInfo.url,
            { trustedRoots: caTLSCACerts, verify: false },
            caInfo.caName
        );

        console.log(`Built a CA Client named ${caInfo.caName}`);
        return caClient;
    }

    /**
     * Initialize the wallet
     */
    async initWallet() {
        const walletPath = path.join(__dirname, 'wallet');
        this.wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);
    }

    /**
     * Enroll admin user
     */
    async enrollAdmin() {
        const ccp = this.buildCCP();
        const caClient = this.buildCAClient(ccp);

        // Check if admin already enrolled
        const identity = await this.wallet.get('admin');
        if (identity) {
            console.log('Admin identity already exists in the wallet');
            return;
        }

        // Enroll admin
        const enrollment = await caClient.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: 'adminpw'
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: this.mspId,
            type: 'X.509',
        };

        await this.wallet.put('admin', x509Identity);
        console.log('Successfully enrolled admin user and imported it into the wallet');
    }

    /**
     * Register and enroll application user
     */
    async registerUser() {
        const ccp = this.buildCCP();
        const caClient = this.buildCAClient(ccp);

        // Check if user already enrolled
        const userIdentity = await this.wallet.get(this.userId);
        if (userIdentity) {
            console.log(`Identity for user ${this.userId} already exists in the wallet`);
            return;
        }

        // Must use an admin to register a new user
        const adminIdentity = await this.wallet.get('admin');
        if (!adminIdentity) {
            console.log('Admin identity does not exist in the wallet. Enrolling admin first...');
            await this.enrollAdmin();
        }

        // Build user object for authenticating with the CA
        const provider = this.wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user
        const secret = await caClient.register(
            {
                affiliation: 'org1.department1',
                enrollmentID: this.userId,
                role: 'client'
            },
            adminUser
        );

        // Enroll the user
        const enrollment = await caClient.enroll({
            enrollmentID: this.userId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: this.mspId,
            type: 'X.509',
        };

        await this.wallet.put(this.userId, x509Identity);
        console.log(`Successfully registered and enrolled user ${this.userId} and imported it into the wallet`);
    }

    /**
     * Connect to the Fabric network
     */
    async connect() {
        try {
            // Initialize wallet
            await this.initWallet();

            // Ensure user is enrolled
            const userIdentity = await this.wallet.get(this.userId);
            if (!userIdentity) {
                console.log(`Identity for user ${this.userId} does not exist. Registering user...`);
                await this.registerUser();
            }

            // Load connection profile
            const ccp = this.buildCCP();

            // Create a new gateway
            this.gateway = new Gateway();
            await this.gateway.connect(ccp, {
                wallet: this.wallet,
                identity: this.userId,
                discovery: { enabled: true, asLocalhost: true }
            });

            console.log('Successfully connected to Fabric network');
        } catch (error) {
            console.error(`Failed to connect to Fabric network: ${error}`);
            throw error;
        }
    }

    /**
     * Get the contract instance
     */
    async getContract() {
        if (!this.gateway) {
            await this.connect();
        }

        const network = await this.gateway.getNetwork(this.channelName);
        return network.getContract(this.chaincodeName);
    }

    /**
     * Submit a transaction (for write operations)
     */
    async submitTransaction(functionName, ...args) {
        try {
            const contract = await this.getContract();
            const result = await contract.submitTransaction(functionName, ...args);
            return JSON.parse(result.toString());
        } catch (error) {
            console.error(`Failed to submit transaction ${functionName}: ${error}`);
            throw error;
        }
    }

    /**
     * Evaluate a transaction (for read-only operations)
     */
    async evaluateTransaction(functionName, ...args) {
        try {
            const contract = await this.getContract();
            const result = await contract.evaluateTransaction(functionName, ...args);
            return JSON.parse(result.toString());
        } catch (error) {
            console.error(`Failed to evaluate transaction ${functionName}: ${error}`);
            throw error;
        }
    }

    /**
     * Disconnect from the gateway
     */
    async disconnect() {
        if (this.gateway) {
            this.gateway.disconnect();
            console.log('Disconnected from Fabric network');
        }
    }

    // ==================== Stablecoin Operations ====================

    async mint(accountId, amount) {
        return await this.submitTransaction('Mint', accountId, amount.toString());
    }

    async transfer(fromAccountId, toAccountId, amount) {
        return await this.submitTransaction('Transfer', fromAccountId, toAccountId, amount.toString());
    }

    async burn(accountId, amount) {
        return await this.submitTransaction('Burn', accountId, amount.toString());
    }

    async balanceOf(accountId) {
        return await this.evaluateTransaction('BalanceOf', accountId);
    }

    async totalSupply() {
        return await this.evaluateTransaction('TotalSupply');
    }

    async getAccountHistory(accountId) {
        return await this.evaluateTransaction('GetAccountHistory', accountId);
    }

    async freezeAccount(accountId) {
        return await this.submitTransaction('FreezeAccount', accountId);
    }

    async unfreezeAccount(accountId) {
        return await this.submitTransaction('UnfreezeAccount', accountId);
    }
}

module.exports = FabricClient;
