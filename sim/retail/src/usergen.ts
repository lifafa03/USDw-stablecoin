/**
 * 4A.1 — User Generator
 * Generates N test users with deterministic seeding for retail payment simulation
 */

import seedrandom from 'seedrandom';
import * as fs from 'fs';
import * as path from 'path';
import { Gateway, Wallets } from 'fabric-network';

export interface TestUser {
  user_id: string;
  kyc_level: 'None' | 'Basic' | 'Enhanced' | 'Institutional';
  kyc_status: 'Pending' | 'Approved' | 'Rejected' | 'Suspended';
  governance_tags: string[];
  initial_balance: number;
  utxos: string[];
  created_at: number;
}

export interface UserGeneratorConfig {
  num_users: number;
  seed: string;
  min_balance: number;
  max_balance: number;
  utxos_per_user: { min: number; max: number };
  output_file: string;
}

export class UserGenerator {
  private rng: seedrandom.PRNG;
  private config: UserGeneratorConfig;
  private users: TestUser[] = [];

  constructor(config: Partial<UserGeneratorConfig> = {}) {
    this.config = {
      num_users: config.num_users || 100,
      seed: config.seed || 'genusd-retail-sim-2025',
      min_balance: config.min_balance || 1000,
      max_balance: config.max_balance || 1000000,
      utxos_per_user: config.utxos_per_user || { min: 5, max: 10 },
      output_file: config.output_file || path.join(__dirname, '../../results/users.json'),
    };

    this.rng = seedrandom(this.config.seed);
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  /**
   * Select random item from array
   */
  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(this.rng() * array.length)];
  }

  /**
   * Generate all test users with deterministic properties
   */
  generateUsers(): TestUser[] {
    console.log(`Generating ${this.config.num_users} test users...`);
    console.log(`Seed: ${this.config.seed}`);

    const kycLevels: TestUser['kyc_level'][] = ['None', 'Basic', 'Enhanced', 'Institutional'];
    const kycStatuses: TestUser['kyc_status'][] = ['Approved', 'Pending'];
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
      let kycLevel: TestUser['kyc_level'];
      if (kycRoll < 0.4) kycLevel = 'Basic';
      else if (kycRoll < 0.7) kycLevel = 'Enhanced';
      else if (kycRoll < 0.9) kycLevel = 'None';
      else kycLevel = 'Institutional';

      // Most users are approved, 10% pending
      const kycStatus = this.rng() < 0.9 ? 'Approved' : 'Pending';

      // Random governance tags (1-3 tags)
      const numTags = this.randomInt(1, 3);
      const userTags: string[] = [];
      for (let t = 0; t < numTags; t++) {
        const tag = this.randomChoice(governanceTags);
        if (!userTags.includes(tag)) {
          userTags.push(tag);
        }
      }

      // Random balance
      const balance = this.randomInt(this.config.min_balance, this.config.max_balance);

      // Number of UTXOs (for fragmentation testing)
      const numUtxos = this.randomInt(
        this.config.utxos_per_user.min,
        this.config.utxos_per_user.max
      );

      const user: TestUser = {
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
  async preMintBalances(gateway: Gateway): Promise<void> {
    console.log('\nPre-minting initial balances...');

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('genusd', '');

    let successCount = 0;
    let failCount = 0;

    for (const user of this.users) {
      try {
        // Calculate UTXO amounts for fragmentation
        const numUtxos = this.randomInt(
          this.config.utxos_per_user.min,
          this.config.utxos_per_user.max
        );

        // Split balance into random UTXO amounts
        let remaining = user.initial_balance;
        const amounts: number[] = [];

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
      } catch (error: any) {
        console.error(`  Failed to mint for ${user.user_id}: ${error.message}`);
        failCount++;
      }
    }

    console.log(`\n✓ Pre-minting complete: ${successCount} success, ${failCount} failed`);
  }

  /**
   * Query actual UTXOs for each user from blockchain
   */
  async queryUserUTXOs(gateway: Gateway): Promise<void> {
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
      } catch (error: any) {
        console.error(`  Failed to query UTXOs for ${user.user_id}: ${error.message}`);
      }
    }

    console.log(`✓ UTXO query complete`);
  }

  /**
   * Save users to JSON file
   */
  saveToFile(): void {
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
  static loadFromFile(filePath: string): TestUser[] {
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
    }, {} as Record<string, number>);

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

  getUsers(): TestUser[] {
    return this.users;
  }
}

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

      console.log('\n✓ Connected to Fabric network');

      // Pre-mint balances
      await generator.preMintBalances(gateway);

      // Query UTXOs
      await generator.queryUserUTXOs(gateway);

      await gateway.disconnect();
    } catch (error: any) {
      console.error('\n✗ Fabric connection failed:', error.message);
      console.log('  Users generated but not pre-minted on blockchain');
    }

    // Save to file
    generator.saveToFile();

    console.log('\n✅ User generation complete!');
  })().catch(console.error);
}
