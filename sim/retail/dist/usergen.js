"use strict";
/**
 * 4A.1 — User Generator
 * Generates N test users with deterministic seeding for retail payment simulation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserGenerator = void 0;
const seedrandom_1 = __importDefault(require("seedrandom"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fabric_network_1 = require("fabric-network");
class UserGenerator {
    constructor(config = {}) {
        this.users = [];
        this.config = {
            num_users: config.num_users || 100,
            seed: config.seed || 'genusd-retail-sim-2025',
            min_balance: config.min_balance || 1000,
            max_balance: config.max_balance || 1000000,
            utxos_per_user: config.utxos_per_user || { min: 5, max: 10 },
            output_file: config.output_file || path.join(__dirname, '../../results/users.json'),
        };
        this.rng = (0, seedrandom_1.default)(this.config.seed);
    }
    /**
     * Generate random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(this.rng() * (max - min + 1)) + min;
    }
    /**
     * Select random item from array
     */
    randomChoice(array) {
        return array[Math.floor(this.rng() * array.length)];
    }
    /**
     * Generate all test users with deterministic properties
     */
    generateUsers() {
        console.log(`Generating ${this.config.num_users} test users...`);
        console.log(`Seed: ${this.config.seed}`);
        const kycLevels = ['None', 'Basic', 'Enhanced', 'Institutional'];
        const kycStatuses = ['Approved', 'Pending'];
        const governanceTags = [
            'retail',
            'merchant',
            'institutional',
            'high-volume',
            'verified',
            'premium',
        ];
        for (let i = 0; i < this.config.num_users; i++) {
            const userId = `User_${String(i).padStart(5, '0')}`;
            // Deterministic KYC level distribution:
            // 40% Basic, 30% Enhanced, 20% None, 10% Institutional
            const kycRoll = this.rng();
            let kycLevel;
            if (kycRoll < 0.4)
                kycLevel = 'Basic';
            else if (kycRoll < 0.7)
                kycLevel = 'Enhanced';
            else if (kycRoll < 0.9)
                kycLevel = 'None';
            else
                kycLevel = 'Institutional';
            // Most users are approved, 10% pending
            const kycStatus = this.rng() < 0.9 ? 'Approved' : 'Pending';
            // Random governance tags (1-3 tags)
            const numTags = this.randomInt(1, 3);
            const userTags = [];
            for (let t = 0; t < numTags; t++) {
                const tag = this.randomChoice(governanceTags);
                if (!userTags.includes(tag)) {
                    userTags.push(tag);
                }
            }
            // Random balance
            const balance = this.randomInt(this.config.min_balance, this.config.max_balance);
            // Number of UTXOs (for fragmentation testing)
            const numUtxos = this.randomInt(this.config.utxos_per_user.min, this.config.utxos_per_user.max);
            const user = {
                user_id: userId,
                kyc_level: kycLevel,
                kyc_status: kycStatus,
                governance_tags: userTags,
                initial_balance: balance,
                utxos: [], // Will be populated after minting
                created_at: Date.now(),
            };
            this.users.push(user);
        }
        console.log(`✓ Generated ${this.users.length} users`);
        return this.users;
    }
    /**
     * Pre-mint initial balances for all users using Mint
     */
    async preMintBalances(gateway) {
        console.log('\nPre-minting initial balances...');
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('genusd', '');
        let successCount = 0;
        let failCount = 0;
        for (const user of this.users) {
            try {
                // Calculate UTXO amounts for fragmentation
                const numUtxos = this.randomInt(this.config.utxos_per_user.min, this.config.utxos_per_user.max);
                // Split balance into random UTXO amounts
                let remaining = user.initial_balance;
                const amounts = [];
                for (let i = 0; i < numUtxos - 1; i++) {
                    // Random split
                    const amount = this.randomInt(1, Math.floor(remaining / (numUtxos - i)));
                    amounts.push(amount);
                    remaining -= amount;
                }
                amounts.push(remaining); // Last UTXO gets remainder
                // Mint multiple UTXOs for this user
                for (const amount of amounts) {
                    await contract.submitTransaction('SimpleMint', user.user_id, amount.toString());
                }
                successCount++;
                if (successCount % 10 === 0) {
                    console.log(`  Minted balances for ${successCount}/${this.users.length} users`);
                }
            }
            catch (error) {
                console.error(`  Failed to mint for ${user.user_id}: ${error.message}`);
                failCount++;
            }
        }
        console.log(`\n✓ Pre-minting complete: ${successCount} success, ${failCount} failed`);
    }
    /**
     * Query actual UTXOs for each user from blockchain
     */
    async queryUserUTXOs(gateway) {
        console.log('\nQuerying user UTXOs...');
        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('genusd', '');
        for (const user of this.users) {
            try {
                // Get balance to verify
                const balanceStr = await contract.evaluateTransaction('GetBalance', user.user_id);
                const balance = parseInt(balanceStr.toString());
                // Note: We don't have a direct GetUTXOs function, so we'll mark them as minted
                // In real implementation, you'd query all UTXOs for this user
                user.utxos = [`minted_${user.user_id}`]; // Placeholder
            }
            catch (error) {
                console.error(`  Failed to query UTXOs for ${user.user_id}: ${error.message}`);
            }
        }
        console.log(`✓ UTXO query complete`);
    }
    /**
     * Save users to JSON file
     */
    saveToFile() {
        const outputDir = path.dirname(this.config.output_file);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const data = {
            generated_at: new Date().toISOString(),
            seed: this.config.seed,
            total_users: this.users.length,
            config: this.config,
            users: this.users,
        };
        fs.writeFileSync(this.config.output_file, JSON.stringify(data, null, 2));
        console.log(`\n✓ Users saved to: ${this.config.output_file}`);
    }
    /**
     * Load users from file
     */
    static loadFromFile(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.users;
    }
    /**
     * Get statistics about generated users
     */
    getStats() {
        const kycLevelCounts = this.users.reduce((acc, u) => {
            acc[u.kyc_level] = (acc[u.kyc_level] || 0) + 1;
            return acc;
        }, {});
        const totalBalance = this.users.reduce((sum, u) => sum + u.initial_balance, 0);
        const avgBalance = totalBalance / this.users.length;
        return {
            total_users: this.users.length,
            kyc_distribution: kycLevelCounts,
            total_initial_balance: totalBalance,
            avg_balance: Math.round(avgBalance),
            min_balance: Math.min(...this.users.map((u) => u.initial_balance)),
            max_balance: Math.max(...this.users.map((u) => u.initial_balance)),
        };
    }
    getUsers() {
        return this.users;
    }
}
exports.UserGenerator = UserGenerator;
// CLI execution
if (require.main === module) {
    (async () => {
        const generator = new UserGenerator({
            num_users: parseInt(process.env.NUM_USERS || '100'),
            seed: process.env.SEED || 'genusd-retail-sim-2025',
        });
        // Generate users
        generator.generateUsers();
        // Print statistics
        const stats = generator.getStats();
        console.log('\nUser Generation Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        // Connect to Fabric for pre-minting
        try {
            const ccpPath = path.resolve(__dirname, '../../../app/server/connection-org1-with-channel.json');
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
            const walletPath = path.resolve(__dirname, '../../../app/server/wallet');
            const wallet = await fabric_network_1.Wallets.newFileSystemWallet(walletPath);
            const gateway = new fabric_network_1.Gateway();
            await gateway.connect(ccp, {
                wallet,
                identity: 'Admin@org1.example.com',
                discovery: { enabled: false, asLocalhost: true },
            });
            console.log('\n✓ Connected to Fabric network');
            // Pre-mint balances
            await generator.preMintBalances(gateway);
            // Query UTXOs
            await generator.queryUserUTXOs(gateway);
            await gateway.disconnect();
        }
        catch (error) {
            console.error('\n✗ Fabric connection failed:', error.message);
            console.log('  Users generated but not pre-minted on blockchain');
        }
        // Save to file
        generator.saveToFile();
        console.log('\n✅ User generation complete!');
    })().catch(console.error);
}
