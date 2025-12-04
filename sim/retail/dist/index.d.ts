/**
 * 4A.4 — Main Orchestration
 * Run complete retail payment simulation pipeline
 */
import { TrafficPattern } from './payment-sim';
interface SimulationConfig {
    num_users: number;
    num_transactions: number;
    traffic_pattern: TrafficPattern;
    seed: string;
    skip_user_generation?: boolean;
    skip_payment_simulation?: boolean;
    skip_analysis?: boolean;
}
declare class RetailSimulation {
    private config;
    constructor(config?: Partial<SimulationConfig>);
    /**
     * Run full simulation pipeline
     */
    run(): Promise<void>;
    /**
     * Step 1: Generate test users and pre-mint balances
     */
    private stepUserGeneration;
    /**
     * Step 2: Run payment simulation with selected traffic pattern
     */
    private stepPaymentSimulation;
    /**
     * Step 3: Analyze metrics and generate reports
     */
    private stepMetricsAnalysis;
    /**
     * Print location of output files
     */
    private printResultsLocation;
}
export { RetailSimulation, SimulationConfig };
