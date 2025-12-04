/**
 * 4A.3 — Metrics Analyzer
 * Compute latency, throughput, UTXO fragmentation, supply invariants
 */
export interface SimulationMetrics {
    total_transactions: number;
    successful: number;
    failed: number;
    success_rate: number;
    latency: {
        avg_ms: number;
        min_ms: number;
        max_ms: number;
        p50_ms: number;
        p90_ms: number;
        p95_ms: number;
        p99_ms: number;
    };
    throughput: {
        total_duration_s: number;
        txs_per_second: number;
    };
    errors: {
        total: number;
        by_type: Record<string, number>;
    };
    supply_check: {
        expected_supply: number;
        actual_supply: number;
        matches: boolean;
    };
}
export declare class MetricsAnalyzer {
    private results;
    private metrics;
    /**
     * Load transaction results from file
     */
    loadResults(filePath: string): void;
    /**
     * Calculate percentile
     */
    private percentile;
    /**
     * Analyze latency metrics
     */
    private analyzeLatency;
    /**
     * Analyze throughput
     */
    private analyzeThroughput;
    /**
     * Analyze errors
     */
    private analyzeErrors;
    /**
     * Query blockchain for total supply check
     */
    checkSupplyInvariant(): Promise<{
        expected_supply: number;
        actual_supply: number;
    }>;
    /**
     * Compute all metrics
     */
    computeMetrics(): Promise<SimulationMetrics>;
    /**
     * Generate console output with tables
     */
    displayMetrics(): void;
    /**
     * Display ASCII histogram of latency distribution
     */
    private displayLatencyHistogram;
    /**
     * Generate bottleneck analysis
     */
    generateBottleneckAnalysis(): string[];
    /**
     * Save metrics to JSON
     */
    saveMetricsJSON(outputPath: string): void;
    /**
     * Generate Markdown report
     */
    generateMarkdownReport(outputPath: string): void;
}
