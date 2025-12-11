/**
 * 4A.2 — Payment Simulation Engine
 * Generates 100-5000 randomized transfers with traffic patterns
 */

import seedrandom from 'seedrandom';
import * as fs from 'fs';
import * as path from 'path';
import { Gateway, Wallets, Contract } from 'fabric-network';
import { TestUser } from './usergen';

export type TrafficPattern = 'uniform' | 'burst' | 'zipf';

export interface TransactionResult {
  tx_id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
  latency_ms: number;
  success: boolean;
  error?: string;
  endorsers?: number;
  rwset_size?: number;
}

export interface PaymentSimConfig {
  users_file: string;
  num_transactions: number;
  traffic_pattern: TrafficPattern;
  seed: string;
  output_file: string;
  burst_size?: number; // For burst mode
  burst_interval_ms?: number;
  max_concurrent?: number;
  retry_attempts?: number;
}

export class PaymentSimulator {
  private rng: seedrandom.PRNG;
  private config: PaymentSimConfig;
  private users: TestUser[] = [];
  private results: TransactionResult[] = [];
  private contract?: Contract;

  constructor(config: Partial<PaymentSimConfig> = {}) {
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

    this.rng = seedrandom(this.config.seed);
  }

  /**
   * Load users from file
   */
  loadUsers(): void {
    console.log(`Loading users from ${this.config.users_file}...`);
    const data = JSON.parse(fs.readFileSync(this.config.users_file, 'utf8'));
    this.users = data.users;
    console.log(`✓ Loaded ${this.users.length} users`);
  }

  /**
   * Connect to Fabric network
   */
  async connect(): Promise<Gateway> {
    const ccpPath = path.resolve(
      __dirname,
      '../../../app/server/connection-org1-with-channel.json'
    );
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    const walletPath = path.resolve(__dirname, '../../../app/server/wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const gateway = new Gateway();
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
  private randomInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  /**
   * Select random user based on traffic pattern
   */
  private selectUser(isHeavy: boolean = false): TestUser {
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
  private generateAmount(sender: TestUser): number {
    const maxAmount = Math.min(sender.initial_balance * 0.5, 10000);
    return this.randomInt(1, maxAmount);
  }

  /**
   * Execute a single transfer with retry logic
   */
  async executeTransfer(
    sender: TestUser,
    receiver: TestUser,
    amount: number
  ): Promise<TransactionResult> {
    const txId = `tx_${Date.now()}_${this.randomInt(1000, 9999)}`;
    const startTime = Date.now();

    let lastError: string | undefined;

    for (let attempt = 0; attempt < this.config.retry_attempts!; attempt++) {
      try {
        if (!this.contract) {
          throw new Error('Contract not initialized');
        }

        // Submit transfer using Transfer function
        await this.contract.submitTransaction(
          'SimpleTransfer',
          sender.user_id,
          receiver.user_id,
          amount.toString()
        );

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
      } catch (error: any) {
        lastError = error.message;
        // Wait before retry
        if (attempt < this.config.retry_attempts! - 1) {
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
  async runUniformPattern(): Promise<void> {
    console.log(`\nRunning UNIFORM pattern: ${this.config.num_transactions} transactions`);

    const batchSize = this.config.max_concurrent!;
    const numBatches = Math.ceil(this.config.num_transactions / batchSize);

    for (let batch = 0; batch < numBatches; batch++) {
      const txsInBatch = Math.min(batchSize, this.config.num_transactions - batch * batchSize);
      const promises: Promise<TransactionResult>[] = [];

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
  async runBurstPattern(): Promise<void> {
    console.log(
      `\nRunning BURST pattern: ${this.config.num_transactions} transactions in bursts of ${this.config.burst_size}`
    );

    let completed = 0;
    const burstSize = this.config.burst_size!;

    while (completed < this.config.num_transactions) {
      const txsInBurst = Math.min(burstSize, this.config.num_transactions - completed);
      const promises: Promise<TransactionResult>[] = [];

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
  async runZipfPattern(): Promise<void> {
    console.log(
      `\nRunning ZIPF pattern: ${this.config.num_transactions} transactions (80/20 rule)`
    );

    const batchSize = this.config.max_concurrent!;
    const numBatches = Math.ceil(this.config.num_transactions / batchSize);

    for (let batch = 0; batch < numBatches; batch++) {
      const txsInBatch = Math.min(batchSize, this.config.num_transactions - batch * batchSize);
      const promises: Promise<TransactionResult>[] = [];

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
  async runSimulation(): Promise<void> {
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
  saveResults(): void {
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

  getResults(): TransactionResult[] {
    return this.results;
  }
}

// CLI execution
if (require.main === module) {
  (async () => {
    const pattern = (process.env.PATTERN || 'uniform') as TrafficPattern;
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
    } finally {
      await gateway.disconnect();
    }
  })().catch(console.error);
}
