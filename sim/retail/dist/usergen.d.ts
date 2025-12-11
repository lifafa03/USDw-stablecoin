/**
 * 4A.1 — User Generator
 * Generates N test users with deterministic seeding for retail payment simulation
 */
import { Gateway } from 'fabric-network';
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
    utxos_per_user: {
        min: number;
        max: number;
    };
    output_file: string;
}
export declare class UserGenerator {
    private rng;
    private config;
    private users;
    constructor(config?: Partial<UserGeneratorConfig>);
    /**
     * Generate random integer between min and max (inclusive)
     */
    private randomInt;
    /**
     * Select random item from array
     */
    private randomChoice;
    /**
     * Generate all test users with deterministic properties
     */
    generateUsers(): TestUser[];
    /**
     * Pre-mint initial balances for all users using Mint
     */
    preMintBalances(gateway: Gateway): Promise<void>;
    /**
     * Query actual UTXOs for each user from blockchain
     */
    queryUserUTXOs(gateway: Gateway): Promise<void>;
    /**
     * Save users to JSON file
     */
    saveToFile(): void;
    /**
     * Load users from file
     */
    static loadFromFile(filePath: string): TestUser[];
    /**
     * Get statistics about generated users
     */
    getStats(): {
        total_users: number;
        kyc_distribution: Record<string, number>;
        total_initial_balance: number;
        avg_balance: number;
        min_balance: number;
        max_balance: number;
    };
    getUsers(): TestUser[];
}
