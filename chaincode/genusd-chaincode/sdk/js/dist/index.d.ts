/**
 * UTXO (Unspent Transaction Output) structure
 */
export interface UTXO {
    utxo_id: string;
    owner_id: string;
    amount: number;
    status: 'active' | 'spent' | 'frozen';
    asset_code: string;
    kyc_tag?: string;
    created_at?: number;
}
/**
 * Transaction request for mint operation
 */
export interface MintRequest {
    outputs: Omit<UTXO, 'utxo_id' | 'status' | 'created_at'>[];
    issuer_id: string;
    dilithium_signature: string;
}
/**
 * Transaction request for transfer operation
 */
export interface TransferRequest {
    inputs: string[];
    outputs: Omit<UTXO, 'utxo_id' | 'status' | 'created_at'>[];
    sender_id: string;
    dilithium_signature: string;
}
/**
 * Transaction request for burn operation
 */
export interface BurnRequest {
    inputs: string[];
    burner_id: string;
    dilithium_signature: string;
}
/**
 * Governance action request
 */
export interface GovernanceRequest {
    action: 'freeze' | 'unfreeze' | 'seize' | 'redeem' | 'attest';
    target_user?: string;
    target_utxo?: string;
    amount?: number;
    reason?: string;
    admin_id: string;
    dilithium_signature: string;
    [key: string]: any;
}
/**
 * ZK Proof structure
 */
export interface ZKProof {
    proof_bytes: string;
    public_inputs: string[];
    commitment: string;
    nullifier: string;
    metadata?: Record<string, any>;
}
/**
 * API Response wrapper
 */
export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    tx_id?: string;
}
/**
 * GENUSD SDK Client Configuration
 */
export interface GENUSDConfig {
    apiUrl: string;
    apiKey?: string;
    timeout?: number;
    enableMockSignatures?: boolean;
}
/**
 * GENUSD SDK Client
 * Provides methods to interact with GENUSD stablecoin chaincode via REST API
 */
export declare class GENUSDClient {
    private api;
    private config;
    constructor(config: GENUSDConfig);
    /**
     * Generate mock Dilithium signature (for testing only)
     */
    private generateMockSignature;
    /**
     * Create Dilithium signature headers for API request
     */
    private createSignatureHeaders;
    /**
     * Mint new stablecoins (issuer only)
     */
    mint(request: MintRequest): Promise<APIResponse<{
        utxo_ids: string[];
    }>>;
    /**
     * Transfer stablecoins between users
     */
    transfer(request: TransferRequest): Promise<APIResponse<{
        utxo_ids: string[];
    }>>;
    /**
     * Burn stablecoins (destroy tokens)
     */
    burn(request: BurnRequest): Promise<APIResponse<{
        burned_amount: number;
    }>>;
    /**
     * Get UTXO by ID
     */
    getUTXO(utxoId: string): Promise<APIResponse<UTXO>>;
    /**
     * Get user balance (sum of active UTXOs)
     */
    getBalance(userId: string): Promise<APIResponse<{
        balance: number;
        utxos: UTXO[];
    }>>;
    /**
     * Execute governance action
     */
    governance(request: GovernanceRequest): Promise<APIResponse>;
    /**
     * Verify zero-knowledge proof
     */
    verifyZKProof(proof: ZKProof): Promise<APIResponse<{
        valid: boolean;
    }>>;
    /**
     * Get policy registry
     */
    getPolicyRegistry(): Promise<APIResponse<any>>;
    /**
     * Get Prometheus metrics
     */
    getMetrics(): Promise<APIResponse<string>>;
    /**
     * Get audit events
     */
    getAuditEvents(filters?: {
        start_time?: number;
        end_time?: number;
        actor?: string;
        action?: string;
    }): Promise<APIResponse<any[]>>;
}
/**
 * Create GENUSD SDK client instance
 */
export declare function createClient(config: GENUSDConfig): GENUSDClient;
export default GENUSDClient;
