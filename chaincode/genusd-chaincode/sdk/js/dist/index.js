"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENUSDClient = void 0;
exports.createClient = createClient;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * GENUSD SDK Client
 * Provides methods to interact with GENUSD stablecoin chaincode via REST API
 */
class GENUSDClient {
    constructor(config) {
        this.config = {
            timeout: 30000,
            enableMockSignatures: false,
            ...config,
        };
        this.api = axios_1.default.create({
            baseURL: this.config.apiUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
            },
        });
    }
    /**
     * Generate mock Dilithium signature (for testing only)
     */
    generateMockSignature(message) {
        if (!this.config.enableMockSignatures) {
            throw new Error('Mock signatures disabled. Use real Dilithium signing.');
        }
        const hash = crypto_1.default.createHash('sha256').update(message).digest('hex');
        return `MOCK_DILITHIUM_SIG_${hash.substring(0, 32)}`;
    }
    /**
     * Create Dilithium signature headers for API request
     */
    createSignatureHeaders(message, signerId) {
        const timestamp = Date.now();
        const signature = this.config.enableMockSignatures
            ? this.generateMockSignature(message)
            : message; // In production, use real Dilithium library
        return {
            'X-Dilithium-Signature': signature,
            'X-Dilithium-Signer': signerId,
            'X-Timestamp': timestamp.toString(),
        };
    }
    /**
     * Mint new stablecoins (issuer only)
     */
    async mint(request) {
        const message = JSON.stringify({
            action: 'mint',
            outputs: request.outputs,
            issuer_id: request.issuer_id,
        });
        const headers = this.createSignatureHeaders(message, request.issuer_id);
        try {
            const response = await this.api.post('/mint', {
                outputs: request.outputs,
                issuer_id: request.issuer_id,
                dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
            }, { headers });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Transfer stablecoins between users
     */
    async transfer(request) {
        const message = JSON.stringify({
            action: 'transfer',
            inputs: request.inputs,
            outputs: request.outputs,
            sender_id: request.sender_id,
        });
        const headers = this.createSignatureHeaders(message, request.sender_id);
        try {
            const response = await this.api.post('/transfer', {
                inputs: request.inputs,
                outputs: request.outputs,
                sender_id: request.sender_id,
                dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
            }, { headers });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Burn stablecoins (destroy tokens)
     */
    async burn(request) {
        const message = JSON.stringify({
            action: 'burn',
            inputs: request.inputs,
            burner_id: request.burner_id,
        });
        const headers = this.createSignatureHeaders(message, request.burner_id);
        try {
            const response = await this.api.post('/burn', {
                inputs: request.inputs,
                burner_id: request.burner_id,
                dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
            }, { headers });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Get UTXO by ID
     */
    async getUTXO(utxoId) {
        try {
            const response = await this.api.get(`/utxo/${utxoId}`);
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Get user balance (sum of active UTXOs)
     */
    async getBalance(userId) {
        try {
            const response = await this.api.get(`/balance/${userId}`);
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Execute governance action
     */
    async governance(request) {
        const endpoint = `/policy/${request.action}`;
        const message = JSON.stringify(request);
        const headers = this.createSignatureHeaders(message, request.admin_id);
        try {
            const response = await this.api.post(endpoint, {
                ...request,
                dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
            }, { headers });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Verify zero-knowledge proof
     */
    async verifyZKProof(proof) {
        try {
            const response = await this.api.post('/zk/attest', { proof });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Get policy registry
     */
    async getPolicyRegistry() {
        try {
            const response = await this.api.get('/policy/registry');
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Get Prometheus metrics
     */
    async getMetrics() {
        try {
            const response = await this.api.get('/metrics');
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
    /**
     * Get audit events
     */
    async getAuditEvents(filters) {
        try {
            const response = await this.api.get('/audit/events', {
                params: filters,
            });
            return response.data;
        }
        catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || error.message,
            };
        }
    }
}
exports.GENUSDClient = GENUSDClient;
/**
 * Create GENUSD SDK client instance
 */
function createClient(config) {
    return new GENUSDClient(config);
}
exports.default = GENUSDClient;
