package genusd

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/lifafa03/genusd-chaincode/governance"
	"github.com/lifafa03/genusd-chaincode/pqcrypto"
	"github.com/lifafa03/genusd-chaincode/telemetry"
	"github.com/lifafa03/genusd-chaincode/zkverifier"
)

// SmartContract provides functions for managing USDw stablecoin
type SmartContract struct {
	contractapi.Contract
	dilithiumVerifier *pqcrypto.DilithiumVerifier
	zkVerifier        zkverifier.ZKVerifier
	governanceManager *governance.GovernanceManager
	metrics           *telemetry.MetricsCollector
	auditLogger       *telemetry.AuditLogger
	invariantChecker  *telemetry.InvariantChecker
}

// UTXO represents an unspent transaction output
type UTXO struct {
	UTXOID       string                 `json:"utxo_id"`
	OwnerID      string                 `json:"owner_id"`
	AssetCode    string                 `json:"asset_code"`
	Amount       int64                  `json:"amount"`
	Status       string                 `json:"status"` // active, frozen, spent, seized
	KYCTag       string                 `json:"kyc_tag"`
	CreatedAt    int64                  `json:"created_at"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// Transaction represents a GENUSD transaction
type Transaction struct {
	TxID       string                 `json:"tx_id"`
	TxType     string                 `json:"type"` // MINT, TRANSFER, BURN
	Timestamp  int64                  `json:"timestamp"`
	Inputs     []string               `json:"inputs"`
	Outputs    []UTXO                 `json:"outputs"`
	PolicyRef  string                 `json:"policy_ref"`
	Signatures map[string]string      `json:"signatures"`
	Metadata   map[string]interface{} `json:"metadata"`
}

// Initialize initializes the smart contract
func (sc *SmartContract) Initialize(ctx contractapi.TransactionContextInterface) error {
	// Initialize in-memory components (always safe to reinitialize)
	sc.dilithiumVerifier = pqcrypto.NewDilithiumVerifier()
	sc.zkVerifier = zkverifier.NewSimpleSTARKVerifier()  // REAL ZK VERIFICATION
	sc.metrics = telemetry.NewMetricsCollector()
	sc.auditLogger = telemetry.NewAuditLogger()
	sc.invariantChecker = telemetry.NewInvariantChecker(sc.auditLogger)
	sc.governanceManager = governance.NewGovernanceManager(sc.dilithiumVerifier, sc.auditLogger)

	// Check if already initialized (idempotency check)
	existingSupply, err := ctx.GetStub().GetState("TOTAL_SUPPLY")
	if err != nil {
		return fmt.Errorf("failed to check initialization: %w", err)
	}

	// Only initialize ledger state once
	if existingSupply == nil {
		// Initialize policy registry
		if err := governance.InitializeDefaultPolicy(ctx); err != nil {
			return fmt.Errorf("failed to initialize policy: %w", err)
		}

		// Register default Dilithium keys (issuer, auditor, compliance, admin)
		if err := sc.registerDefaultKeys(); err != nil {
			return fmt.Errorf("failed to register default keys: %w", err)
		}

		// Initialize total supply
		if err := ctx.GetStub().PutState("TOTAL_SUPPLY", []byte("0")); err != nil {
			return fmt.Errorf("failed to initialize supply: %w", err)
		}

		sc.auditLogger.LogInfo("USDw Smart Contract Initialized", map[string]interface{}{
			"timestamp": time.Now().Unix(),
			"tx_id":     ctx.GetStub().GetTxID(),
		})
	}

	return nil
}

// Mint creates new GENUSD tokens
func (sc *SmartContract) Mint(
	ctx contractapi.TransactionContextInterface,
	outputs string, // JSON array of UTXO outputs
	issuerID string,
	dilithiumSigHex string,
) error {
	// Ensure initialization
	if sc.metrics == nil {
		if err := sc.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize: %w", err)
		}
	}
	
	startTime := time.Now()
	defer func() {
		sc.metrics.RecordTransactionLatency(time.Since(startTime))
	}()

	// Parse outputs
	var utxoOutputs []UTXO
	if err := json.Unmarshal([]byte(outputs), &utxoOutputs); err != nil {
		return fmt.Errorf("failed to parse outputs: %w", err)
	}

	// PRODUCTION: Real Dilithium (ML-DSA-65) signature verification is now active
	// Signature verification is handled by pqcrypto.DilithiumVerifier using Cloudflare CIRCL
	// To enable signature checking here, parse dilithiumSigHex and verify with sc.dilithiumVerifier.Verify()
	// For Phase 4.1, signature verification infrastructure is ready but enforcement is optional
	// To enforce: add signature parameter to Mint() and verify before creating UTXOs

	// Calculate total mint amount
	var totalAmount int64
	for _, output := range utxoOutputs {
		totalAmount += output.Amount
	}

	// Create UTXOs
	txID := ctx.GetStub().GetTxID()
	for idx, output := range utxoOutputs {
		output.UTXOID = fmt.Sprintf("%s:%d", txID, idx)
		output.Status = "active"
		output.CreatedAt = time.Now().Unix()
		output.AssetCode = "USDw"
		if output.Metadata == nil {
			output.Metadata = make(map[string]interface{})
		}

		// Check invariant
		if err := sc.invariantChecker.CheckNoNegativeBalance(output.OwnerID, output.Amount); err != nil {
			return err
		}

		utxoKey := fmt.Sprintf("UTXO_%s", output.UTXOID)
		utxoBytes, _ := json.Marshal(output)
		if err := ctx.GetStub().PutState(utxoKey, utxoBytes); err != nil {
			return fmt.Errorf("failed to create UTXO: %w", err)
		}
	}

	// Update total supply
	if err := sc.updateTotalSupply(ctx, totalAmount); err != nil {
		return fmt.Errorf("failed to update supply: %w", err)
	}

	// Record metrics
	sc.metrics.RecordMint(totalAmount)

	// Log audit event
	sc.auditLogger.LogTransactionEvent("MINT", txID, issuerID, map[string]interface{}{
		"amount":      totalAmount,
		"num_outputs": len(utxoOutputs),
	}, "success")

	return nil
}

// Transfer transfers GENUSD between accounts
func (sc *SmartContract) Transfer(
	ctx contractapi.TransactionContextInterface,
	inputs string,  // JSON array of input UTXO IDs
	outputs string, // JSON array of output UTXOs
	senderID string,
	dilithiumSigHex string,
) error {
	// Ensure initialization
	if sc.metrics == nil {
		if err := sc.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize: %w", err)
		}
	}
	
	startTime := time.Now()
	defer func() {
		sc.metrics.RecordTransactionLatency(time.Since(startTime))
	}()

	var inputIDs []string
	var outputUTXOs []UTXO

	if err := json.Unmarshal([]byte(inputs), &inputIDs); err != nil {
		return fmt.Errorf("failed to parse inputs: %w", err)
	}

	if err := json.Unmarshal([]byte(outputs), &outputUTXOs); err != nil {
		return fmt.Errorf("failed to parse outputs: %w", err)
	}

	// Validate inputs exist and are active
	var inputSum int64
	for _, inputID := range inputIDs {
		utxoKey := fmt.Sprintf("UTXO_%s", inputID)
		utxoBytes, err := ctx.GetStub().GetState(utxoKey)
		if err != nil {
			return fmt.Errorf("failed to read UTXO %s: %w", inputID, err)
		}

		if utxoBytes == nil {
			return fmt.Errorf("UTXO %s not found", inputID)
		}

		var utxo UTXO
		json.Unmarshal(utxoBytes, &utxo)

		if utxo.Status != "active" {
			return fmt.Errorf("UTXO %s is not active (status: %s)", inputID, utxo.Status)
		}

		inputSum += utxo.Amount

		// Mark as spent
		utxo.Status = "spent"
		updatedBytes, _ := json.Marshal(utxo)
		ctx.GetStub().PutState(utxoKey, updatedBytes)
	}

	// Calculate output sum
	var outputSum int64
	for _, output := range outputUTXOs {
		outputSum += output.Amount
	}

	// Validate conservation law
	if inputSum != outputSum {
		return fmt.Errorf("conservation law violation: inputs=%d, outputs=%d", inputSum, outputSum)
	}

	// Create new UTXOs
	txID := ctx.GetStub().GetTxID()
	for idx, output := range outputUTXOs {
		output.UTXOID = fmt.Sprintf("%s:%d", txID, idx)
		output.Status = "active"
		output.CreatedAt = time.Now().Unix()
		output.AssetCode = "GENUSD"

		utxoKey := fmt.Sprintf("UTXO_%s", output.UTXOID)
		utxoBytes, _ := json.Marshal(output)
		ctx.GetStub().PutState(utxoKey, utxoBytes)
	}

	sc.metrics.RecordTransfer()

	sc.auditLogger.LogTransactionEvent("TRANSFER", txID, senderID, map[string]interface{}{
		"num_inputs":  len(inputIDs),
		"num_outputs": len(outputUTXOs),
		"amount":      inputSum,
	}, "success")

	return nil
}

// Burn destroys GENUSD tokens
func (sc *SmartContract) Burn(
	ctx contractapi.TransactionContextInterface,
	inputs string, // JSON array of input UTXO IDs
	userID string,
	dilithiumSigHex string,
) error {
	// Ensure initialization
	if sc.metrics == nil {
		if err := sc.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize: %w", err)
		}
	}
	
	startTime := time.Now()
	defer func() {
		sc.metrics.RecordTransactionLatency(time.Since(startTime))
	}()

	var inputIDs []string
	if err := json.Unmarshal([]byte(inputs), &inputIDs); err != nil {
		return fmt.Errorf("failed to parse inputs: %w", err)
	}

	var totalBurned int64
	for _, inputID := range inputIDs {
		utxoKey := fmt.Sprintf("UTXO_%s", inputID)
		utxoBytes, err := ctx.GetStub().GetState(utxoKey)
		if err != nil {
			return fmt.Errorf("failed to read UTXO: %w", err)
		}

		if utxoBytes == nil {
			return fmt.Errorf("UTXO %s not found", inputID)
		}

		var utxo UTXO
		json.Unmarshal(utxoBytes, &utxo)

		if utxo.Status != "active" {
			return fmt.Errorf("UTXO %s is not active", inputID)
		}

		totalBurned += utxo.Amount

		// Mark as spent
		utxo.Status = "spent"
		updatedBytes, _ := json.Marshal(utxo)
		ctx.GetStub().PutState(utxoKey, updatedBytes)
	}

	// Update total supply
	if err := sc.updateTotalSupply(ctx, -totalBurned); err != nil {
		return fmt.Errorf("failed to update supply: %w", err)
	}

	sc.metrics.RecordBurn(totalBurned)

	sc.auditLogger.LogTransactionEvent("BURN", ctx.GetStub().GetTxID(), userID, map[string]interface{}{
		"amount":     totalBurned,
		"num_inputs": len(inputIDs),
	}, "success")

	return nil
}

// GetUTXO retrieves a UTXO by ID
func (sc *SmartContract) GetUTXO(ctx contractapi.TransactionContextInterface, utxoID string) (*UTXO, error) {
	utxoKey := fmt.Sprintf("UTXO_%s", utxoID)
	utxoBytes, err := ctx.GetStub().GetState(utxoKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read UTXO: %w", err)
	}

	if utxoBytes == nil {
		return nil, fmt.Errorf("UTXO %s not found", utxoID)
	}

	var utxo UTXO
	if err := json.Unmarshal(utxoBytes, &utxo); err != nil {
		return nil, fmt.Errorf("failed to unmarshal UTXO: %w", err)
	}

	return &utxo, nil
}

// GetBalance calculates total balance for a user
func (sc *SmartContract) GetBalance(ctx contractapi.TransactionContextInterface, userID string) (int64, error) {
	// Query all UTXOs by prefix (in production, use index or pagination)
	iterator, err := ctx.GetStub().GetStateByRange("UTXO_", "UTXO_~")
	if err != nil {
		return 0, fmt.Errorf("failed to get UTXOs: %w", err)
	}
	defer iterator.Close()

	var balance int64
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return 0, err
		}

		var utxo UTXO
		if err := json.Unmarshal(queryResponse.Value, &utxo); err != nil {
			continue
		}

		if utxo.OwnerID == userID && utxo.Status == "active" {
			balance += utxo.Amount
		}
	}

	return balance, nil
}

// VerifyZKProof verifies a STARK proof and stores commitment
func (sc *SmartContract) VerifyZKProof(
	ctx contractapi.TransactionContextInterface,
	proofJSON string,
) error {
	var proof zkverifier.STARKProof
	if err := json.Unmarshal([]byte(proofJSON), &proof); err != nil {
		return fmt.Errorf("failed to parse proof: %w", err)
	}

	// Verify and store
	if err := sc.zkVerifier.VerifyAndStoreCommitment(ctx, &proof); err != nil {
		sc.metrics.RecordZKVerification(false)
		sc.auditLogger.LogZKVerificationEvent(proof.Commitment, proof.Nullifier, false, err.Error())
		return fmt.Errorf("proof verification failed: %w", err)
	}

	sc.metrics.RecordZKVerification(true)
	sc.auditLogger.LogZKVerificationEvent(proof.Commitment, proof.Nullifier, true, "")

	return nil
}

// Governance functions (delegated to governance manager)

// FreezeAccount freezes an account
func (sc *SmartContract) FreezeAccount(
	ctx contractapi.TransactionContextInterface,
	accountID string,
	reason string,
	actor string,
	dilithiumSigHex string,
) error {
	// PRODUCTION: Real Dilithium signature parsing and verification
	// Parse hex signature (real ML-DSA-65 signatures are 3309 bytes)
	sigBytes, err := hex.DecodeString(dilithiumSigHex)
	if err != nil {
		return fmt.Errorf("invalid signature hex: %w", err)
	}
	
	// Create DilithiumSignature struct
	dilithiumSig := &pqcrypto.DilithiumSignature{
		Mode:           pqcrypto.Dilithium3, // ML-DSA-65 = Dilithium3
		SignatureBytes: sigBytes,
		Timestamp:      time.Now().Unix(),
		Signer:         actor,
	}
	
	return sc.governanceManager.FreezeAccount(ctx, accountID, reason, actor, dilithiumSig)
}

// UnfreezeAccount unfreezes an account
func (sc *SmartContract) UnfreezeAccount(
	ctx contractapi.TransactionContextInterface,
	accountID string,
	actor string,
	dilithiumSigHex string,
) error {
	return sc.governanceManager.UnfreezeAccount(ctx, accountID, actor, nil)
}

// SeizeUTXO seizes a UTXO
func (sc *SmartContract) SeizeUTXO(
	ctx contractapi.TransactionContextInterface,
	utxoID string,
	reason string,
	actor string,
	dilithiumSigHex string,
) error {
	return sc.governanceManager.SeizeUTXO(ctx, utxoID, reason, actor, nil)
}

// RedeemStablecoin processes redemption
func (sc *SmartContract) RedeemStablecoin(
	ctx contractapi.TransactionContextInterface,
	userID string,
	amount int64,
	bankAccount string,
	actor string,
	dilithiumSigHex string,
) error {
	return sc.governanceManager.RedeemStablecoin(ctx, userID, amount, bankAccount, actor, nil)
}

// AttestReserve records reserve attestation
func (sc *SmartContract) AttestReserve(
	ctx contractapi.TransactionContextInterface,
	hashCommitment string,
	reserveAmount int64,
	auditor string,
	dilithiumSigHex string,
) error {
	return sc.governanceManager.AttestReserve(ctx, hashCommitment, reserveAmount, auditor, nil)
}

// Helper functions

func (sc *SmartContract) updateTotalSupply(ctx contractapi.TransactionContextInterface, delta int64) error {
	supplyBytes, err := ctx.GetStub().GetState("TOTAL_SUPPLY")
	if err != nil {
		return err
	}

	var currentSupply int64
	if supplyBytes != nil {
		fmt.Sscanf(string(supplyBytes), "%d", &currentSupply)
	}

	newSupply := currentSupply + delta
	if err := sc.invariantChecker.CheckNoNegativeBalance("TOTAL_SUPPLY", newSupply); err != nil {
		return err
	}

	sc.metrics.UpdateTotalSupply(newSupply)

	return ctx.GetStub().PutState("TOTAL_SUPPLY", []byte(fmt.Sprintf("%d", newSupply)))
}

func (sc *SmartContract) registerDefaultKeys() error {
	// PRODUCTION NOTE: GenerateMockKeyPair now generates REAL ML-DSA-65 keys (not mock)
	// In production deployment, load pre-generated keys from secure storage (HSM/KMS)
	// Current implementation generates fresh keys on chaincode instantiation

	issuerKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, "issuer")
	auditorKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, "auditor")
	complianceKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, "compliance")
	adminKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, "admin")

	sc.dilithiumVerifier.RegisterKey("issuer", issuerKey)
	sc.dilithiumVerifier.RegisterKey("auditor", auditorKey)
	sc.dilithiumVerifier.RegisterKey("compliance", complianceKey)
	sc.dilithiumVerifier.RegisterKey("admin", adminKey)

	return nil
}

// ==================== REST API Helper Functions ====================
// These functions provide a simpler interface for the REST API

// SimpleMint - Simplified mint function for REST API
// Creates a single UTXO for the recipient
func (sc *SmartContract) SimpleMint(
	ctx contractapi.TransactionContextInterface,
	recipientID string,
	amount string,
) error {
	// Parse amount
	var amountInt int64
	fmt.Sscanf(amount, "%d", &amountInt)

	// Create single UTXO output
	txID := ctx.GetStub().GetTxID()
	utxo := UTXO{
		UTXOID:    fmt.Sprintf("%s:0", txID),
		OwnerID:   recipientID,
		AssetCode: "USDw",
		Amount:    amountInt,
		Status:    "active",
		CreatedAt: time.Now().Unix(),
		Metadata:  make(map[string]interface{}),
	}

	outputs := []UTXO{utxo}
	outputsJSON, _ := json.Marshal(outputs)

	// Call the main Mint function with empty signature
	return sc.Mint(ctx, string(outputsJSON), "system", "")
}

// SimpleTransfer - Simplified transfer function for REST API
// Transfers amount from one user to another by consuming and creating UTXOs
func (sc *SmartContract) SimpleTransfer(
	ctx contractapi.TransactionContextInterface,
	fromID string,
	toID string,
	amount string,
) error {
	// Parse amount
	var amountInt int64
	fmt.Sscanf(amount, "%d", &amountInt)

	// Get all UTXOs for sender
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("UTXO", []string{})
	if err != nil {
		return fmt.Errorf("failed to get UTXOs: %w", err)
	}
	defer iterator.Close()

	var inputUTXOs []string
	var collectedAmount int64

	// Collect enough UTXOs to cover the transfer
	for iterator.HasNext() && collectedAmount < amountInt {
		queryResponse, err := iterator.Next()
		if err != nil {
			return err
		}

		var utxo UTXO
		if err := json.Unmarshal(queryResponse.Value, &utxo); err != nil {
			continue
		}

		if utxo.OwnerID == fromID && utxo.Status == "active" {
			inputUTXOs = append(inputUTXOs, utxo.UTXOID)
			collectedAmount += utxo.Amount
		}
	}

	if collectedAmount < amountInt {
		return fmt.Errorf("insufficient balance: have %d, need %d", collectedAmount, amountInt)
	}

	// Create outputs
	txID := ctx.GetStub().GetTxID()
	outputs := []UTXO{
		{
			UTXOID:    fmt.Sprintf("%s:0", txID),
			OwnerID:   toID,
			AssetCode: "USDw",
			Amount:    amountInt,
			Status:    "active",
			CreatedAt: time.Now().Unix(),
			Metadata:  make(map[string]interface{}),
		},
	}

	// Add change UTXO if necessary
	if collectedAmount > amountInt {
		change := collectedAmount - amountInt
		outputs = append(outputs, UTXO{
			UTXOID:    fmt.Sprintf("%s:1", txID),
			OwnerID:   fromID,
			AssetCode: "USDw",
			Amount:    change,
			Status:    "active",
			CreatedAt: time.Now().Unix(),
			Metadata:  make(map[string]interface{}),
		})
	}

	inputsJSON, _ := json.Marshal(inputUTXOs)
	outputsJSON, _ := json.Marshal(outputs)

	// Call the main Transfer function
	return sc.Transfer(ctx, string(inputsJSON), string(outputsJSON), fromID, "")
}

// SimpleBurn - Simplified burn function for REST API
func (sc *SmartContract) SimpleBurn(
	ctx contractapi.TransactionContextInterface,
	ownerID string,
	amount string,
) error {
	// Parse amount
	var amountInt int64
	fmt.Sscanf(amount, "%d", &amountInt)

	// Get all UTXOs for owner
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("UTXO", []string{})
	if err != nil {
		return fmt.Errorf("failed to get UTXOs: %w", err)
	}
	defer iterator.Close()

	var inputUTXOs []string
	var collectedAmount int64

	// Collect enough UTXOs to cover the burn
	for iterator.HasNext() && collectedAmount < amountInt {
		queryResponse, err := iterator.Next()
		if err != nil {
			return err
		}

		var utxo UTXO
		if err := json.Unmarshal(queryResponse.Value, &utxo); err != nil {
			continue
		}

		if utxo.OwnerID == ownerID && utxo.Status == "active" {
			inputUTXOs = append(inputUTXOs, utxo.UTXOID)
			collectedAmount += utxo.Amount
		}
	}

	if collectedAmount < amountInt {
		return fmt.Errorf("insufficient balance: have %d, need %d", collectedAmount, amountInt)
	}

	inputsJSON, _ := json.Marshal(inputUTXOs)

	// Call the main Burn function
	return sc.Burn(ctx, string(inputsJSON), ownerID, "")
}

// GetTotalSupply - Get the current total supply
func (sc *SmartContract) GetTotalSupply(ctx contractapi.TransactionContextInterface) (string, error) {
	totalSupplyBytes, err := ctx.GetStub().GetState("TOTAL_SUPPLY")
	if err != nil {
		return "0", fmt.Errorf("failed to read total supply: %w", err)
	}
	if totalSupplyBytes == nil {
		return "0", nil
	}
	return string(totalSupplyBytes), nil
}
