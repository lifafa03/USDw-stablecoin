"use strict";
/**
 * 4A.2 — Payment Simulation Engine
 * Generates 100-5000 randomized transfers with traffic patterns
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
exports.PaymentSimulator = void 0;
const seedrandom_1 = __importDefault(require("seedrandom"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fabric_network_1 = require("fabric-network");
class PaymentSimulator {
    constructor(config = {}) {
        this.users = [];
        this.results = [];
        this.config = {
            users_file: config.users_file || path.join(__dirname, '../../results/users.json'),
            num_transactions: config.num_transactions || 1000,
            traffic_pattern: config.traffic_pattern || 'uniform',
            seed: config.seed || 'genusd-payment-sim-2025',
            output_file: config.output_file || path.join(__dirname, '../../results/transactions.json'),
            burst_size: config.burst_size || 50,
            burst_interval_ms: config.burst_interval_ms || 100,
            max_concurrent: config.max_concurrent || 10,
            retry_attempts: config.retry_attempts || 3,
        };
        this.rng = (0, seedrandom_1.default)(this.config.seed);
    }
    /**
     * Load users from file
     */
    loadUsers() {
        console.log(`Loading users from ${this.config.users_file}...`);
        const data = JSON.parse(fs.readFileSync(this.config.users_file, 'utf8'));
        this.users = data.users;
        console.log(`✓ Loaded ${this.users.length} users`);
    }
    /**
     * Connect to Fabric network
     */
    async connect() {
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
        const network = await gateway.getNetwork('mychannel');
        this.contract = network.getContract('genusd', '');
        console.log('✓ Connected to Fabric network');
        return gateway;
    }
    /**
     * Generate random integer
     */
    randomInt(min, max) {
        return Math.floor(this.rng() * (max - min + 1)) + min;
    }
    /**
     * Select random user based on traffic pattern
     */
    selectUser(isHeavy = false) {
        if (this.config.traffic_pattern === 'zipf' && isHeavy) {
            // Heavy users: top 20% do 80% of transactions
            const heavyIndex = Math.floor(this.rng() * (this.users.length * 0.2));
            return this.users[heavyIndex];
        }
        // Uniform: any user
        return this.users[Math.floor(this.rng() * this.users.length)];
    }
    /**
     * Generate random transaction amount
     */
    generateAmount(sender) {
        const maxAmount = Math.min(sender.initial_balance * 0.5, 10000);
        return this.randomInt(1, maxAmount);
    }
    /**
     * Execute a single transfer with retry logic
     */
    async executeTransfer(sender, receiver, amount) {
        const txId = `tx_${Date.now()}_${this.randomInt(1000, 9999)}`;
        const startTime = Date.now();
        let lastError;
        for (let attempt = 0; attempt < this.config.retry_attempts; attempt++) {
            try {
                if (!this.contract) {
                    throw new Error('Contract not initialized');
                }
                // Submit transfer using SimpleTransfer
                await this.contract.submitTransaction('SimpleTransfer', sender.user_id, receiver.user_id, amount.toString());
                const latency = Date.now() - startTime;
                return {
                    tx_id: txId,
                    sender: sender.user_id,
                    receiver: receiver.user_id,
                    amount,
                    timestamp: startTime,
                    latency_ms: latency,
                    success: true,
                };
            }
            catch (error) {
                lastError = error.message;
                // Wait before retry
                if (attempt < this.config.retry_attempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
                }
            }
        }
        // All retries failed
        const latency = Date.now() - startTime;
        return {
            tx_id: txId,
            sender: sender.user_id,
            receiver: receiver.user_id,
            amount,
            timestamp: startTime,
            latency_ms: latency,
            success: false,
            error: lastError,
        };
    }
    /**
     * Run uniform random traffic pattern
     */
    async runUniformPattern() {
        console.log(`\nRunning UNIFORM pattern: ${this.config.num_transactions} transactions`);
        const batchSize = this.config.max_concurrent;
        const numBatches = Math.ceil(this.config.num_transactions / batchSize);
        for (let batch = 0; batch < numBatches; batch++) {
            const txsInBatch = Math.min(batchSize, this.config.num_transactions - batch * batchSize);
            const promises = [];
            for (let i = 0; i < txsInBatch; i++) {
                const sender = this.selectUser();
                let receiver = this.selectUser();
                // Ensure sender != receiver
                while (receiver.user_id === sender.user_id) {
                    receiver = this.selectUser();
                }
                const amount = this.generateAmount(sender);
                promises.push(this.executeTransfer(sender, receiver, amount));
            }
            const batchResults = await Promise.all(promises);
            this.results.push(...batchResults);
            const progress = ((batch + 1) / numBatches) * 100;
            console.log(`  Progress: ${progress.toFixed(1)}% (${this.results.length} txs)`);
        }
    }
    /**
     * Run burst traffic pattern (DDoS simulation)
     */
    async runBurstPattern() {
        console.log(`\nRunning BURST pattern: ${this.config.num_transactions} transactions in bursts of ${this.config.burst_size}`);
        let completed = 0;
        const burstSize = this.config.burst_size;
        while (completed < this.config.num_transactions) {
            const txsInBurst = Math.min(burstSize, this.config.num_transactions - completed);
            const promises = [];
            // Send burst all at once
            for (let i = 0; i < txsInBurst; i++) {
                const sender = this.selectUser();
                let receiver = this.selectUser();
                while (receiver.user_id === sender.user_id) {
                    receiver = this.selectUser();
                }
                const amount = this.generateAmount(sender);
                promises.push(this.executeTransfer(sender, receiver, amount));
            }
            const burstResults = await Promise.all(promises);
            this.results.push(...burstResults);
            completed += txsInBurst;
            console.log(`  Burst complete: ${completed}/${this.config.num_transactions} txs`);
            // Wait between bursts
            if (completed < this.config.num_transactions) {
                await new Promise((resolve) => setTimeout(resolve, this.config.burst_interval_ms));
            }
        }
    }
    /**
     * Run Zipf distribution (heavy hitters)
     */
    async runZipfPattern() {
        console.log(`\nRunning ZIPF pattern: ${this.config.num_transactions} transactions (80/20 rule)`);
        const batchSize = this.config.max_concurrent;
        const numBatches = Math.ceil(this.config.num_transactions / batchSize);
        for (let batch = 0; batch < numBatches; batch++) {
            const txsInBatch = Math.min(batchSize, this.config.num_transactions - batch * batchSize);
            const promises = [];
            for (let i = 0; i < txsInBatch; i++) {
                // 80% of transactions from top 20% of users
                const isHeavy = this.rng() < 0.8;
                const sender = this.selectUser(isHeavy);
                let receiver = this.selectUser();
                while (receiver.user_id === sender.user_id) {
                    receiver = this.selectUser();
                }
                const amount = this.generateAmount(sender);
                promises.push(this.executeTransfer(sender, receiver, amount));
            }
            const batchResults = await Promise.all(promises);
            this.results.push(...batchResults);
            const progress = ((batch + 1) / numBatches) * 100;
            console.log(`  Progress: ${progress.toFixed(1)}% (${this.results.length} txs)`);
        }
    }
    /**
     * Run simulation with selected traffic pattern
     */
    async runSimulation() {
        console.log(`\n=== Payment Simulation Start ===`);
        console.log(`Traffic Pattern: ${this.config.traffic_pattern.toUpperCase()}`);
        console.log(`Transactions: ${this.config.num_transactions}`);
        console.log(`Users: ${this.users.length}`);
        const startTime = Date.now();
        switch (this.config.traffic_pattern) {
            case 'uniform':
                await this.runUniformPattern();
                break;
            case 'burst':
                await this.runBurstPattern();
                break;
            case 'zipf':
                await this.runZipfPattern();
                break;
        }
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✓ Simulation complete in ${duration.toFixed(2)}s`);
    }
    /**
     * Save results to file
     */
    saveResults() {
        const outputDir = path.dirname(this.config.output_file);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const data = {
            completed_at: new Date().toISOString(),
            config: this.config,
            total_transactions: this.results.length,
            successful: this.results.filter((r) => r.success).length,
            failed: this.results.filter((r) => !r.success).length,
            transactions: this.results,
        };
        fs.writeFileSync(this.config.output_file, JSON.stringify(data, null, 2));
        console.log(`✓ Results saved to: ${this.config.output_file}`);
    }
    getResults() {
        return this.results;
    }
}
exports.PaymentSimulator = PaymentSimulator;
// CLI execution
if (require.main === module) {
    (async () => {
        const pattern = (process.env.PATTERN || 'uniform');
        const numTx = parseInt(process.env.NUM_TX || '1000');
        const simulator = new PaymentSimulator({
            num_transactions: numTx,
            traffic_pattern: pattern,
        });
        simulator.loadUsers();
        const gateway = await simulator.connect();
        try {
            await simulator.runSimulation();
            simulator.saveResults();
            console.log('\n✅ Payment simulation complete!');
        }
        finally {
            await gateway.disconnect();
        }
    })().catch(console.error);
}
