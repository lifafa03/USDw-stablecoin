/**
 * 4A.2 — Payment Simulation Engine
 * Generates 100-5000 randomized transfers with traffic patterns
 */
import { Gateway } from 'fabric-network';
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
    burst_size?: number;
    burst_interval_ms?: number;
    max_concurrent?: number;
    retry_attempts?: number;
}
export declare class PaymentSimulator {
    private rng;
    private config;
    private users;
    private results;
    private contract?;
    constructor(config?: Partial<PaymentSimConfig>);
    /**
     * Load users from file
     */
    loadUsers(): void;
    /**
     * Connect to Fabric network
     */
    connect(): Promise<Gateway>;
    /**
     * Generate random integer
     */
    private randomInt;
    /**
     * Select random user based on traffic pattern
     */
    private selectUser;
    /**
     * Generate random transaction amount
     */
    private generateAmount;
    /**
     * Execute a single transfer with retry logic
     */
    executeTransfer(sender: TestUser, receiver: TestUser, amount: number): Promise<TransactionResult>;
    /**
     * Run uniform random traffic pattern
     */
    runUniformPattern(): Promise<void>;
    /**
     * Run burst traffic pattern (DDoS simulation)
     */
    runBurstPattern(): Promise<void>;
    /**
     * Run Zipf distribution (heavy hitters)
     */
    runZipfPattern(): Promise<void>;
    /**
     * Run simulation with selected traffic pattern
     */
    runSimulation(): Promise<void>;
    /**
     * Save results to file
     */
    saveResults(): void;
    getResults(): TransactionResult[];
}
