import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

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
  inputs: string[]; // UTXO IDs
  outputs: Omit<UTXO, 'utxo_id' | 'status' | 'created_at'>[];
  sender_id: string;
  dilithium_signature: string;
}

/**
 * Transaction request for burn operation
 */
export interface BurnRequest {
  inputs: string[]; // UTXO IDs to burn
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
export class GENUSDClient {
  private api: AxiosInstance;
  private config: GENUSDConfig;

  constructor(config: GENUSDConfig) {
    this.config = {
      timeout: 30000,
      enableMockSignatures: false,
      ...config,
    };

    this.api = axios.create({
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
  private generateMockSignature(message: string): string {
    if (!this.config.enableMockSignatures) {
      throw new Error('Mock signatures disabled. Use real Dilithium signing.');
    }
    
    const hash = crypto.createHash('sha256').update(message).digest('hex');
    return `MOCK_DILITHIUM_SIG_${hash.substring(0, 32)}`;
  }

  /**
   * Create Dilithium signature headers for API request
   */
  private createSignatureHeaders(message: string, signerId: string): Record<string, string> {
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
  async mint(request: MintRequest): Promise<APIResponse<{ utxo_ids: string[] }>> {
    const message = JSON.stringify({
      action: 'mint',
      outputs: request.outputs,
      issuer_id: request.issuer_id,
    });

    const headers = this.createSignatureHeaders(message, request.issuer_id);

    try {
      const response = await this.api.post<APIResponse<{ utxo_ids: string[] }>>(
        '/mint',
        {
          outputs: request.outputs,
          issuer_id: request.issuer_id,
          dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
        },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Transfer stablecoins between users
   */
  async transfer(request: TransferRequest): Promise<APIResponse<{ utxo_ids: string[] }>> {
    const message = JSON.stringify({
      action: 'transfer',
      inputs: request.inputs,
      outputs: request.outputs,
      sender_id: request.sender_id,
    });

    const headers = this.createSignatureHeaders(message, request.sender_id);

    try {
      const response = await this.api.post<APIResponse<{ utxo_ids: string[] }>>(
        '/transfer',
        {
          inputs: request.inputs,
          outputs: request.outputs,
          sender_id: request.sender_id,
          dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
        },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Burn stablecoins (destroy tokens)
   */
  async burn(request: BurnRequest): Promise<APIResponse<{ burned_amount: number }>> {
    const message = JSON.stringify({
      action: 'burn',
      inputs: request.inputs,
      burner_id: request.burner_id,
    });

    const headers = this.createSignatureHeaders(message, request.burner_id);

    try {
      const response = await this.api.post<APIResponse<{ burned_amount: number }>>(
        '/burn',
        {
          inputs: request.inputs,
          burner_id: request.burner_id,
          dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
        },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Get UTXO by ID
   */
  async getUTXO(utxoId: string): Promise<APIResponse<UTXO>> {
    try {
      const response = await this.api.get<APIResponse<UTXO>>(`/utxo/${utxoId}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Get user balance (sum of active UTXOs)
   */
  async getBalance(userId: string): Promise<APIResponse<{ balance: number; utxos: UTXO[] }>> {
    try {
      const response = await this.api.get<APIResponse<{ balance: number; utxos: UTXO[] }>>(
        `/balance/${userId}`
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Execute governance action
   */
  async governance(request: GovernanceRequest): Promise<APIResponse> {
    const endpoint = `/policy/${request.action}`;
    const message = JSON.stringify(request);

    const headers = this.createSignatureHeaders(message, request.admin_id);

    try {
      const response = await this.api.post<APIResponse>(
        endpoint,
        {
          ...request,
          dilithium_signature: request.dilithium_signature || headers['X-Dilithium-Signature'],
        },
        { headers }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Verify zero-knowledge proof
   */
  async verifyZKProof(proof: ZKProof): Promise<APIResponse<{ valid: boolean }>> {
    try {
      const response = await this.api.post<APIResponse<{ valid: boolean }>>(
        '/zk/attest',
        { proof }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Get policy registry
   */
  async getPolicyRegistry(): Promise<APIResponse<any>> {
    try {
      const response = await this.api.get<APIResponse>('/policy/registry');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Get Prometheus metrics
   */
  async getMetrics(): Promise<APIResponse<string>> {
    try {
      const response = await this.api.get<APIResponse<string>>('/metrics');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }

  /**
   * Get audit events
   */
  async getAuditEvents(
    filters?: {
      start_time?: number;
      end_time?: number;
      actor?: string;
      action?: string;
    }
  ): Promise<APIResponse<any[]>> {
    try {
      const response = await this.api.get<APIResponse<any[]>>('/audit/events', {
        params: filters,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
      };
    }
  }
}

/**
 * Create GENUSD SDK client instance
 */
export function createClient(config: GENUSDConfig): GENUSDClient {
  return new GENUSDClient(config);
}

export default GENUSDClient;
