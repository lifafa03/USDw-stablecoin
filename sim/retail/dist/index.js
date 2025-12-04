"use strict";
/**
 * 4A.4 — Main Orchestration
 * Run complete retail payment simulation pipeline
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
exports.RetailSimulation = void 0;
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const usergen_1 = require("./usergen");
const payment_sim_1 = require("./payment-sim");
const metrics_1 = require("./metrics");
class RetailSimulation {
    constructor(config = {}) {
        this.config = {
            num_users: config.num_users || 100,
            num_transactions: config.num_transactions || 1000,
            traffic_pattern: config.traffic_pattern || 'uniform',
            seed: config.seed || 'genusd-retail-sim-2025',
            skip_user_generation: config.skip_user_generation || false,
            skip_payment_simulation: config.skip_payment_simulation || false,
            skip_analysis: config.skip_analysis || false,
        };
    }
    /**
     * Run full simulation pipeline
     */
    async run() {
        console.log(chalk_1.default.bold.blue('\n╔═══════════════════════════════════════════════════════╗'));
        console.log(chalk_1.default.bold.blue('║   GENUSD Retail Payment Simulation (Phase 4A)      ║'));
        console.log(chalk_1.default.bold.blue('╚═══════════════════════════════════════════════════════╝\n'));
        console.log(chalk_1.default.yellow('Configuration:'));
        console.log(`  Users: ${this.config.num_users}`);
        console.log(`  Transactions: ${this.config.num_transactions}`);
        console.log(`  Traffic Pattern: ${this.config.traffic_pattern.toUpperCase()}`);
        console.log(`  Seed: ${this.config.seed}`);
        console.log('');
        const startTime = Date.now();
        try {
            // Step 1: User Generation
            if (!this.config.skip_user_generation) {
                await this.stepUserGeneration();
            }
            else {
                console.log(chalk_1.default.gray('⏭  Skipping user generation (using existing users.json)\n'));
            }
            // Step 2: Payment Simulation
            if (!this.config.skip_payment_simulation) {
                await this.stepPaymentSimulation();
            }
            else {
                console.log(chalk_1.default.gray('⏭  Skipping payment simulation (using existing transactions.json)\n'));
            }
            // Step 3: Metrics Analysis
            if (!this.config.skip_analysis) {
                await this.stepMetricsAnalysis();
            }
            else {
                console.log(chalk_1.default.gray('⏭  Skipping analysis\n'));
            }
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(chalk_1.default.bold.green(`\n✅ SIMULATION COMPLETE (${duration}s)\n`));
            this.printResultsLocation();
        }
        catch (error) {
            console.error(chalk_1.default.bold.red('\n❌ SIMULATION FAILED\n'));
            console.error(chalk_1.default.red(error.message));
            if (error.stack) {
                console.error(chalk_1.default.gray(error.stack));
            }
            process.exit(1);
        }
    }
    /**
     * Step 1: Generate test users and pre-mint balances
     */
    async stepUserGeneration() {
        console.log(chalk_1.default.bold.cyan('━━━ STEP 1: User Generation ━━━\n'));
        const generator = new usergen_1.UserGenerator({
            num_users: this.config.num_users,
            seed: this.config.seed,
        });
        // Generate users
        generator.generateUsers();
        // Print statistics
        const stats = generator.getStats();
        console.log('\nUser Statistics:');
        console.log(`  Total Users: ${stats.total_users}`);
        console.log(`  KYC Distribution:`);
        Object.entries(stats.kyc_distribution).forEach(([level, count]) => {
            console.log(`    ${level}: ${count}`);
        });
        console.log(`  Total Initial Balance: ${stats.total_initial_balance} USDw`);
        console.log(`  Average Balance: ${stats.avg_balance} USDw`);
        // Connect to Fabric for pre-minting
        try {
            const ccpPath = path.resolve(__dirname, '../../../app/server/connection-org1-with-channel.json');
            const fs = require('fs');
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
            const { Gateway, Wallets } = require('fabric-network');
            const walletPath = path.resolve(__dirname, '../../../app/server/wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);
            const gateway = new Gateway();
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
            console.error(chalk_1.default.yellow('\n⚠  Fabric connection failed:', error.message));
            console.log(chalk_1.default.yellow('  Users generated but not pre-minted on blockchain'));
        }
        // Save to file
        generator.saveToFile();
        console.log(chalk_1.default.green('\n✓ User generation complete\n'));
    }
    /**
     * Step 2: Run payment simulation with selected traffic pattern
     */
    async stepPaymentSimulation() {
        console.log(chalk_1.default.bold.cyan('━━━ STEP 2: Payment Simulation ━━━\n'));
        const simulator = new payment_sim_1.PaymentSimulator({
            num_transactions: this.config.num_transactions,
            traffic_pattern: this.config.traffic_pattern,
            seed: this.config.seed + '-payments',
        });
        simulator.loadUsers();
        const gateway = await simulator.connect();
        try {
            await simulator.runSimulation();
            simulator.saveResults();
        }
        finally {
            await gateway.disconnect();
        }
        console.log(chalk_1.default.green('\n✓ Payment simulation complete\n'));
    }
    /**
     * Step 3: Analyze metrics and generate reports
     */
    async stepMetricsAnalysis() {
        console.log(chalk_1.default.bold.cyan('━━━ STEP 3: Metrics Analysis ━━━\n'));
        const resultsFile = path.join(__dirname, '../../results/transactions.json');
        const outputJSON = path.join(__dirname, '../../results/summary.json');
        const outputMD = path.join(__dirname, '../../results/summary.md');
        const analyzer = new metrics_1.MetricsAnalyzer();
        analyzer.loadResults(resultsFile);
        await analyzer.computeMetrics();
        analyzer.displayMetrics();
        analyzer.saveMetricsJSON(outputJSON);
        analyzer.generateMarkdownReport(outputMD);
        console.log(chalk_1.default.green('\n✓ Metrics analysis complete\n'));
    }
    /**
     * Print location of output files
     */
    printResultsLocation() {
        const resultsDir = path.resolve(__dirname, '../../results');
        console.log(chalk_1.default.bold.blue('📊 Results Location:'));
        console.log(chalk_1.default.cyan(`  ${resultsDir}/`));
        console.log(`    ├── users.json           (Generated test users)`);
        console.log(`    ├── transactions.json     (Raw transaction results)`);
        console.log(`    ├── summary.json          (Metrics in JSON format)`);
        console.log(`    └── summary.md            (Markdown report)`);
        console.log('');
    }
}
exports.RetailSimulation = RetailSimulation;
// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    // Parse CLI arguments
    const config = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--users':
            case '-u':
                config.num_users = parseInt(next);
                i++;
                break;
            case '--transactions':
            case '-t':
                config.num_transactions = parseInt(next);
                i++;
                break;
            case '--pattern':
            case '-p':
                config.traffic_pattern = next;
                i++;
                break;
            case '--seed':
            case '-s':
                config.seed = next;
                i++;
                break;
            case '--skip-users':
                config.skip_user_generation = true;
                break;
            case '--skip-payments':
                config.skip_payment_simulation = true;
                break;
            case '--skip-analysis':
                config.skip_analysis = true;
                break;
            case '--analyze-only':
                config.skip_user_generation = true;
                config.skip_payment_simulation = true;
                break;
            case '--help':
            case '-h':
                console.log(`
GENUSD Retail Payment Simulation

Usage:
  npm run sim [options]

Options:
  -u, --users <n>         Number of test users (default: 100)
  -t, --transactions <n>  Number of transactions (default: 1000)
  -p, --pattern <type>    Traffic pattern: uniform|burst|zipf (default: uniform)
  -s, --seed <string>     Random seed for reproducibility
  --skip-users            Skip user generation (use existing users.json)
  --skip-payments         Skip payment simulation (use existing transactions.json)
  --skip-analysis         Skip metrics analysis
  --analyze-only          Only run analysis on existing data
  -h, --help              Show this help message

Examples:
  npm run sim                                    # Default: 100 users, 1000 tx, uniform
  npm run sim -- -u 200 -t 5000 -p burst        # 200 users, 5000 tx, burst pattern
  npm run sim -- --analyze-only                 # Analyze existing data
  npm run sim -- --skip-users -p zipf           # Use existing users, zipf pattern

Traffic Patterns:
  uniform  Random sender/receiver pairs
  burst    DDoS simulation with transaction bursts
  zipf     80/20 distribution (heavy hitters)
        `);
                process.exit(0);
        }
    }
    // Run simulation
    const simulation = new RetailSimulation(config);
    simulation.run().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
