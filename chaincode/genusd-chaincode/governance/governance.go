package governance

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/lifafa03/genusd-chaincode/pqcrypto"
	"github.com/lifafa03/genusd-chaincode/telemetry"
)

// PolicyAction represents different governance actions
type PolicyAction string

const (
	ActionFreezeAccount   PolicyAction = "FREEZE_ACCOUNT"
	ActionUnfreezeAccount PolicyAction = "UNFREEZE_ACCOUNT"
	ActionSeizeUTXO       PolicyAction = "SEIZE_UTXO"
	ActionRedeemStablecoin PolicyAction = "REDEEM_STABLECOIN"
	ActionAttestReserve   PolicyAction = "ATTEST_RESERVE"
	ActionUpdatePolicy    PolicyAction = "UPDATE_POLICY"
	ActionEmergencyHalt   PolicyAction = "EMERGENCY_HALT"
)

// PolicyRegistry stores governance policies
type PolicyRegistry struct {
	Version          string                   `json:"version"`
	CreatedAt        int64                    `json:"created_at"`
	UpdatedAt        int64                    `json:"updated_at"`
	AdminRoles       map[string]bool          `json:"admin_roles"`
	PolicyRules      map[string]*PolicyRule   `json:"policy_rules"`
	EmergencyMode    bool                     `json:"emergency_mode"`
	RequiredSigners  int                      `json:"required_signers"`
}

// PolicyRule defines a governance policy rule
type PolicyRule struct {
	Action           PolicyAction `json:"action"`
	RequiredRole     string       `json:"required_role"`
	RequiresDilithium bool        `json:"requires_dilithium"`
	MaxAmount        int64        `json:"max_amount"`
	CooldownPeriod   int64        `json:"cooldown_period"`
	Enabled          bool         `json:"enabled"`
}

// GovernanceAction represents a logged governance action
type GovernanceAction struct {
	ActionID        string                 `json:"action_id"`
	Action          PolicyAction           `json:"action"`
	Actor           string                 `json:"actor"`
	Target          string                 `json:"target"`
	Timestamp       int64                  `json:"timestamp"`
	DilithiumSig    string                 `json:"dilithium_signature"`
	Parameters      map[string]interface{} `json:"parameters"`
	Status          string                 `json:"status"` // success, failed, pending
	Reason          string                 `json:"reason"`
}

// GovernanceManager handles all governance operations
type GovernanceManager struct {
	verifier *pqcrypto.DilithiumVerifier
	logger   *telemetry.AuditLogger
}

// NewGovernanceManager creates a new governance manager
func NewGovernanceManager(verifier *pqcrypto.DilithiumVerifier, logger *telemetry.AuditLogger) *GovernanceManager {
	return &GovernanceManager{
		verifier: verifier,
		logger:   logger,
	}
}

// InitializeDefaultPolicy creates the default policy registry
func InitializeDefaultPolicy(ctx contractapi.TransactionContextInterface) error {
	policy := &PolicyRegistry{
		Version:   "v1.0.0",
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		AdminRoles: map[string]bool{
			"issuer":     true,
			"auditor":    true,
			"compliance": true,
			"admin":      true,
		},
		PolicyRules: map[string]*PolicyRule{
			string(ActionFreezeAccount): {
				Action:           ActionFreezeAccount,
				RequiredRole:     "compliance",
				RequiresDilithium: true,
				MaxAmount:        0,
				CooldownPeriod:   0,
				Enabled:          true,
			},
			string(ActionUnfreezeAccount): {
				Action:           ActionUnfreezeAccount,
				RequiredRole:     "compliance",
				RequiresDilithium: true,
				MaxAmount:        0,
				CooldownPeriod:   86400, // 24 hours
				Enabled:          true,
			},
			string(ActionSeizeUTXO): {
				Action:           ActionSeizeUTXO,
				RequiredRole:     "admin",
				RequiresDilithium: true,
				MaxAmount:        10000000000, // $100M limit
				CooldownPeriod:   0,
				Enabled:          true,
			},
			string(ActionRedeemStablecoin): {
				Action:           ActionRedeemStablecoin,
				RequiredRole:     "issuer",
				RequiresDilithium: true,
				MaxAmount:        100000000000, // $1B limit
				CooldownPeriod:   3600, // 1 hour
				Enabled:          true,
			},
			string(ActionAttestReserve): {
				Action:           ActionAttestReserve,
				RequiredRole:     "auditor",
				RequiresDilithium: true,
				MaxAmount:        0,
				CooldownPeriod:   21600, // 6 hours
				Enabled:          true,
			},
		},
		EmergencyMode:   false,
		RequiredSigners: 1, // Multi-sig threshold
	}

	policyBytes, err := json.Marshal(policy)
	if err != nil {
		return fmt.Errorf("failed to marshal policy: %w", err)
	}

	return ctx.GetStub().PutState("POLICY_REGISTRY", policyBytes)
}

// GetPolicyRegistry retrieves the current policy registry
func GetPolicyRegistry(ctx contractapi.TransactionContextInterface) (*PolicyRegistry, error) {
	policyBytes, err := ctx.GetStub().GetState("POLICY_REGISTRY")
	if err != nil {
		return nil, fmt.Errorf("failed to read policy registry: %w", err)
	}

	if policyBytes == nil {
		return nil, errors.New("policy registry not initialized")
	}

	var policy PolicyRegistry
	if err := json.Unmarshal(policyBytes, &policy); err != nil {
		return nil, fmt.Errorf("failed to unmarshal policy: %w", err)
	}

	return &policy, nil
}

// ValidateGovernanceAction verifies a governance action is authorized
func (gm *GovernanceManager) ValidateGovernanceAction(
	ctx contractapi.TransactionContextInterface,
	action PolicyAction,
	actor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
	message []byte,
) error {
	// Get policy registry
	policy, err := GetPolicyRegistry(ctx)
	if err != nil {
		return fmt.Errorf("failed to get policy: %w", err)
	}

	// Check if action is defined
	rule, exists := policy.PolicyRules[string(action)]
	if !exists {
		return fmt.Errorf("action %s not defined in policy", action)
	}

	// Check if action is enabled
	if !rule.Enabled {
		return fmt.Errorf("action %s is disabled", action)
	}

	// Check if actor has required role
	if !policy.AdminRoles[rule.RequiredRole] {
		return fmt.Errorf("role %s not authorized", rule.RequiredRole)
	}

	// Verify Dilithium signature if required
	if rule.RequiresDilithium {
		if dilithiumSig == nil {
			return errors.New("Dilithium signature required but not provided")
		}

		if err := gm.verifier.Verify(message, dilithiumSig, actor); err != nil {
			return fmt.Errorf("Dilithium signature verification failed: %w", err)
		}
	}

	// Check emergency mode
	if policy.EmergencyMode && action != ActionEmergencyHalt {
		return errors.New("system in emergency mode, only emergency actions allowed")
	}

	return nil
}

// FreezeAccount freezes a user account
func (gm *GovernanceManager) FreezeAccount(
	ctx contractapi.TransactionContextInterface,
	accountID string,
	reason string,
	actor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) error {
	// Create message for signature verification
	message := []byte(fmt.Sprintf("FREEZE_ACCOUNT:%s:%s:%d", accountID, reason, time.Now().Unix()))

	// Validate action
	if err := gm.ValidateGovernanceAction(ctx, ActionFreezeAccount, actor, dilithiumSig, message); err != nil {
		return fmt.Errorf("governance validation failed: %w", err)
	}

	// Get account state
	accountKey := fmt.Sprintf("ACCOUNT_%s", accountID)
	accountBytes, err := ctx.GetStub().GetState(accountKey)
	if err != nil {
		return fmt.Errorf("failed to read account: %w", err)
	}

	if accountBytes == nil {
		return fmt.Errorf("account %s not found", accountID)
	}

	var account map[string]interface{}
	if err := json.Unmarshal(accountBytes, &account); err != nil {
		return fmt.Errorf("failed to unmarshal account: %w", err)
	}

	// Update freeze status
	account["frozen"] = true
	account["freeze_reason"] = reason
	account["frozen_at"] = time.Now().Unix()
	account["frozen_by"] = actor

	updatedBytes, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %w", err)
	}

	if err := ctx.GetStub().PutState(accountKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to update account: %w", err)
	}

	// Log governance action
	gm.logGovernanceAction(ctx, ActionFreezeAccount, actor, accountID, map[string]interface{}{
		"reason": reason,
	}, "success", dilithiumSig)

	// Emit event
	ctx.GetStub().SetEvent("AccountFrozen", []byte(accountID))

	return nil
}

// UnfreezeAccount unfreezes a user account
func (gm *GovernanceManager) UnfreezeAccount(
	ctx contractapi.TransactionContextInterface,
	accountID string,
	actor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) error {
	message := []byte(fmt.Sprintf("UNFREEZE_ACCOUNT:%s:%d", accountID, time.Now().Unix()))

	if err := gm.ValidateGovernanceAction(ctx, ActionUnfreezeAccount, actor, dilithiumSig, message); err != nil {
		return fmt.Errorf("governance validation failed: %w", err)
	}

	accountKey := fmt.Sprintf("ACCOUNT_%s", accountID)
	accountBytes, err := ctx.GetStub().GetState(accountKey)
	if err != nil {
		return fmt.Errorf("failed to read account: %w", err)
	}

	if accountBytes == nil {
		return fmt.Errorf("account %s not found", accountID)
	}

	var account map[string]interface{}
	if err := json.Unmarshal(accountBytes, &account); err != nil {
		return fmt.Errorf("failed to unmarshal account: %w", err)
	}

	account["frozen"] = false
	account["freeze_reason"] = ""
	account["unfrozen_at"] = time.Now().Unix()
	account["unfrozen_by"] = actor

	updatedBytes, err := json.Marshal(account)
	if err != nil {
		return fmt.Errorf("failed to marshal account: %w", err)
	}

	if err := ctx.GetStub().PutState(accountKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to update account: %w", err)
	}

	gm.logGovernanceAction(ctx, ActionUnfreezeAccount, actor, accountID, nil, "success", dilithiumSig)
	ctx.GetStub().SetEvent("AccountUnfrozen", []byte(accountID))

	return nil
}

// SeizeUTXO seizes a UTXO for compliance reasons
func (gm *GovernanceManager) SeizeUTXO(
	ctx contractapi.TransactionContextInterface,
	utxoID string,
	reason string,
	actor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) error {
	message := []byte(fmt.Sprintf("SEIZE_UTXO:%s:%s:%d", utxoID, reason, time.Now().Unix()))

	if err := gm.ValidateGovernanceAction(ctx, ActionSeizeUTXO, actor, dilithiumSig, message); err != nil {
		return fmt.Errorf("governance validation failed: %w", err)
	}

	utxoKey := fmt.Sprintf("UTXO_%s", utxoID)
	utxoBytes, err := ctx.GetStub().GetState(utxoKey)
	if err != nil {
		return fmt.Errorf("failed to read UTXO: %w", err)
	}

	if utxoBytes == nil {
		return fmt.Errorf("UTXO %s not found", utxoID)
	}

	var utxo map[string]interface{}
	if err := json.Unmarshal(utxoBytes, &utxo); err != nil {
		return fmt.Errorf("failed to unmarshal UTXO: %w", err)
	}

	// Mark UTXO as seized
	utxo["status"] = "seized"
	utxo["seized_reason"] = reason
	utxo["seized_at"] = time.Now().Unix()
	utxo["seized_by"] = actor

	updatedBytes, err := json.Marshal(utxo)
	if err != nil {
		return fmt.Errorf("failed to marshal UTXO: %w", err)
	}

	if err := ctx.GetStub().PutState(utxoKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to update UTXO: %w", err)
	}

	gm.logGovernanceAction(ctx, ActionSeizeUTXO, actor, utxoID, map[string]interface{}{
		"reason": reason,
		"amount": utxo["amount"],
	}, "success", dilithiumSig)

	ctx.GetStub().SetEvent("UTXOSeized", []byte(utxoID))

	return nil
}

// RedeemStablecoin processes redemption of stablecoin for fiat
func (gm *GovernanceManager) RedeemStablecoin(
	ctx contractapi.TransactionContextInterface,
	userID string,
	amount int64,
	bankAccount string,
	actor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) error {
	message := []byte(fmt.Sprintf("REDEEM:%s:%d:%s:%d", userID, amount, bankAccount, time.Now().Unix()))

	if err := gm.ValidateGovernanceAction(ctx, ActionRedeemStablecoin, actor, dilithiumSig, message); err != nil {
		return fmt.Errorf("governance validation failed: %w", err)
	}

	// Check redemption limit
	policy, _ := GetPolicyRegistry(ctx)
	if rule, exists := policy.PolicyRules[string(ActionRedeemStablecoin)]; exists {
		if amount > rule.MaxAmount {
			return fmt.Errorf("redemption amount %d exceeds limit %d", amount, rule.MaxAmount)
		}
	}

	// Create redemption record
	redemption := map[string]interface{}{
		"user_id":      userID,
		"amount":       amount,
		"bank_account": bankAccount,
		"timestamp":    time.Now().Unix(),
		"actor":        actor,
		"status":       "pending",
	}

	redemptionID := fmt.Sprintf("REDEMPTION_%s_%d", userID, time.Now().Unix())
	redemptionBytes, _ := json.Marshal(redemption)
	ctx.GetStub().PutState(redemptionID, redemptionBytes)

	gm.logGovernanceAction(ctx, ActionRedeemStablecoin, actor, userID, map[string]interface{}{
		"amount":          amount,
		"bank_account":    bankAccount,
		"redemption_id":   redemptionID,
	}, "success", dilithiumSig)

	ctx.GetStub().SetEvent("RedemptionInitiated", redemptionBytes)

	return nil
}

// AttestReserve records a reserve attestation from an auditor
func (gm *GovernanceManager) AttestReserve(
	ctx contractapi.TransactionContextInterface,
	hashCommitment string,
	reserveAmount int64,
	auditor string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) error {
	message := []byte(fmt.Sprintf("ATTEST:%s:%d:%d", hashCommitment, reserveAmount, time.Now().Unix()))

	if err := gm.ValidateGovernanceAction(ctx, ActionAttestReserve, auditor, dilithiumSig, message); err != nil {
		return fmt.Errorf("governance validation failed: %w", err)
	}

	attestation := map[string]interface{}{
		"hash_commitment": hashCommitment,
		"reserve_amount":  reserveAmount,
		"auditor":         auditor,
		"timestamp":       time.Now().Unix(),
		"dilithium_sig":   dilithiumSig.SerializeSignature(),
	}

	attestationID := fmt.Sprintf("ATTESTATION_%d", time.Now().Unix())
	attestationBytes, _ := json.Marshal(attestation)
	ctx.GetStub().PutState(attestationID, attestationBytes)

	// Update latest attestation pointer
	ctx.GetStub().PutState("LATEST_ATTESTATION", []byte(attestationID))

	gm.logGovernanceAction(ctx, ActionAttestReserve, auditor, "RESERVES", map[string]interface{}{
		"commitment": hashCommitment,
		"amount":     reserveAmount,
	}, "success", dilithiumSig)

	ctx.GetStub().SetEvent("ReserveAttested", attestationBytes)

	return nil
}

// logGovernanceAction logs a governance action to audit trail
func (gm *GovernanceManager) logGovernanceAction(
	ctx contractapi.TransactionContextInterface,
	action PolicyAction,
	actor string,
	target string,
	parameters map[string]interface{},
	status string,
	dilithiumSig *pqcrypto.DilithiumSignature,
) {
	actionID := fmt.Sprintf("GOV_ACTION_%s_%d", action, time.Now().UnixNano())
	
	sigStr := ""
	if dilithiumSig != nil {
		sigBytes, _ := json.Marshal(dilithiumSig.SerializeSignature())
		sigStr = string(sigBytes)
	}

	govAction := GovernanceAction{
		ActionID:     actionID,
		Action:       action,
		Actor:        actor,
		Target:       target,
		Timestamp:    time.Now().Unix(),
		DilithiumSig: sigStr,
		Parameters:   parameters,
		Status:       status,
	}

	actionBytes, _ := json.Marshal(govAction)
	ctx.GetStub().PutState(actionID, actionBytes)

	// Log to audit logger if available
	if gm.logger != nil {
		gm.logger.LogGovernanceAction(action, actor, target, parameters)
	}
}
