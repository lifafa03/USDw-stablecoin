package governance

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/lifafa03/genusd-chaincode/pqcrypto"
)

// ProposalStatus represents the state of a governance proposal
type ProposalStatus string

const (
	ProposalPending  ProposalStatus = "pending"
	ProposalApproved ProposalStatus = "approved"
	ProposalRejected ProposalStatus = "rejected"
	ProposalExecuted ProposalStatus = "executed"
	ProposalExpired  ProposalStatus = "expired"
)

// ProposalType defines what action the proposal will take
type ProposalType string

const (
	ProposalFreeze       ProposalType = "FREEZE"
	ProposalUnfreeze     ProposalType = "UNFREEZE"
	ProposalSeize        ProposalType = "SEIZE"
	ProposalRedeem       ProposalType = "REDEEM"
	ProposalPolicyUpdate ProposalType = "POLICY_UPDATE"
	ProposalMintLarge    ProposalType = "MINT_LARGE" // Mints above threshold
)

// MultisigProposal represents a governance action requiring multiple approvals
type MultisigProposal struct {
	ProposalID    string                   `json:"proposalID"`
	Type          ProposalType             `json:"type"`
	Proposer      string                   `json:"proposer"`
	CreatedAt     int64                    `json:"createdAt"`
	ExpiresAt     int64                    `json:"expiresAt"`
	Status        ProposalStatus           `json:"status"`
	Approvals     map[string]*Approval     `json:"approvals"`
	RequiredSigs  int                      `json:"requiredSigs"`
	TotalSigners  int                      `json:"totalSigners"`
	Payload       map[string]interface{}   `json:"payload"`
	ExecutedAt    int64                    `json:"executedAt,omitempty"`
	ExecutedBy    string                   `json:"executedBy,omitempty"`
	Nonce         string                   `json:"nonce"` // Prevents replay attacks
}

// Approval represents a single signer's approval
type Approval struct {
	Signer    string `json:"signer"`
	Timestamp int64  `json:"timestamp"`
	Signature []byte `json:"signature"` // Dilithium signature
	Approved  bool   `json:"approved"`
}

// MultisigConfig defines the M-of-N configuration
type MultisigConfig struct {
	RequiredSignatures int      `json:"requiredSignatures"` // M
	AuthorizedSigners  []string `json:"authorizedSigners"`  // N signers
	ProposalTTL        int64    `json:"proposalTTL"`        // Time to live in seconds
}

// MultisigManager handles proposal creation, approval, and execution
type MultisigManager struct {
	config            *MultisigConfig
	dilithiumVerifier *pqcrypto.DilithiumVerifier
}

// NewMultisigManager creates a new multisig manager with 2-of-3 default
func NewMultisigManager(dilithiumVerifier *pqcrypto.DilithiumVerifier) *MultisigManager {
	return &MultisigManager{
		config: &MultisigConfig{
			RequiredSignatures: 2, // 2-of-3 by default
			AuthorizedSigners:  []string{"admin", "compliance", "auditor"},
			ProposalTTL:        86400, // 24 hours
		},
		dilithiumVerifier: dilithiumVerifier,
	}
}

// CreateProposal creates a new multisig proposal
func (mm *MultisigManager) CreateProposal(
	ctx contractapi.TransactionContextInterface,
	proposalType ProposalType,
	proposer string,
	payload map[string]interface{},
) (*MultisigProposal, error) {
	// Verify proposer is authorized
	if !mm.isAuthorizedSigner(proposer) {
		return nil, fmt.Errorf("proposer %s is not an authorized signer", proposer)
	}

	// Generate unique proposal ID
	proposalID := mm.generateProposalID(proposalType, proposer)

	// Check if proposal already exists
	existingProposal, _ := mm.GetProposal(ctx, proposalID)
	if existingProposal != nil && existingProposal.Status == ProposalPending {
		return nil, fmt.Errorf("proposal %s already exists and is pending", proposalID)
	}

	// Create proposal
	now := time.Now().Unix()
	proposal := &MultisigProposal{
		ProposalID:   proposalID,
		Type:         proposalType,
		Proposer:     proposer,
		CreatedAt:    now,
		ExpiresAt:    now + mm.config.ProposalTTL,
		Status:       ProposalPending,
		Approvals:    make(map[string]*Approval),
		RequiredSigs: mm.config.RequiredSignatures,
		TotalSigners: len(mm.config.AuthorizedSigners),
		Payload:      payload,
		Nonce:        mm.generateNonce(proposalID, now),
	}

	// Store proposal
	if err := mm.saveProposal(ctx, proposal); err != nil {
		return nil, fmt.Errorf("failed to save proposal: %w", err)
	}

	return proposal, nil
}

// ApproveProposal adds an approval to a proposal
func (mm *MultisigManager) ApproveProposal(
	ctx contractapi.TransactionContextInterface,
	proposalID string,
	signer string,
	signature *pqcrypto.DilithiumSignature,
) error {
	// Verify signer is authorized
	if !mm.isAuthorizedSigner(signer) {
		return fmt.Errorf("signer %s is not authorized", signer)
	}

	// Get proposal
	proposal, err := mm.GetProposal(ctx, proposalID)
	if err != nil {
		return fmt.Errorf("proposal not found: %w", err)
	}

	// Check proposal status
	if proposal.Status != ProposalPending {
		return fmt.Errorf("proposal status is %s, not pending", proposal.Status)
	}

	// Check expiration
	if time.Now().Unix() > proposal.ExpiresAt {
		proposal.Status = ProposalExpired
		mm.saveProposal(ctx, proposal)
		return fmt.Errorf("proposal has expired")
	}

	// Check if already approved by this signer
	if _, exists := proposal.Approvals[signer]; exists {
		return fmt.Errorf("signer %s has already voted on this proposal", signer)
	}

	// Verify signature
	message := mm.buildProposalMessage(proposal)
	if err := mm.dilithiumVerifier.Verify(message, signature, signer); err != nil {
		return fmt.Errorf("signature verification failed: %w", err)
	}

	// Add approval
	proposal.Approvals[signer] = &Approval{
		Signer:    signer,
		Timestamp: time.Now().Unix(),
		Signature: signature.SignatureBytes,
		Approved:  true,
	}

	// Check if threshold reached
	if len(proposal.Approvals) >= mm.config.RequiredSignatures {
		proposal.Status = ProposalApproved
	}

	// Save updated proposal
	return mm.saveProposal(ctx, proposal)
}

// ExecuteProposal executes an approved proposal
func (mm *MultisigManager) ExecuteProposal(
	ctx contractapi.TransactionContextInterface,
	proposalID string,
	executor string,
) error {
	// Get proposal
	proposal, err := mm.GetProposal(ctx, proposalID)
	if err != nil {
		return fmt.Errorf("proposal not found: %w", err)
	}

	// Verify status
	if proposal.Status != ProposalApproved {
		return fmt.Errorf("proposal status is %s, must be approved", proposal.Status)
	}

	// Verify executor is authorized (must be one of the approvers)
	if _, exists := proposal.Approvals[executor]; !exists {
		return fmt.Errorf("executor %s did not approve this proposal", executor)
	}

	// Verify not expired
	if time.Now().Unix() > proposal.ExpiresAt {
		proposal.Status = ProposalExpired
		mm.saveProposal(ctx, proposal)
		return fmt.Errorf("proposal has expired")
	}

	// Mark as executed
	proposal.Status = ProposalExecuted
	proposal.ExecutedAt = time.Now().Unix()
	proposal.ExecutedBy = executor

	// Save final state
	return mm.saveProposal(ctx, proposal)
}

// GetProposal retrieves a proposal by ID
func (mm *MultisigManager) GetProposal(
	ctx contractapi.TransactionContextInterface,
	proposalID string,
) (*MultisigProposal, error) {
	key := fmt.Sprintf("PROPOSAL_%s", proposalID)
	proposalBytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	if proposalBytes == nil {
		return nil, fmt.Errorf("proposal %s not found", proposalID)
	}

	var proposal MultisigProposal
	if err := json.Unmarshal(proposalBytes, &proposal); err != nil {
		return nil, err
	}

	return &proposal, nil
}

// ListProposals returns all proposals (with pagination support)
func (mm *MultisigManager) ListProposals(
	ctx contractapi.TransactionContextInterface,
	status ProposalStatus,
) ([]*MultisigProposal, error) {
	// This is a simplified implementation
	// In production, use proper pagination with GetStateByRange
	iterator, err := ctx.GetStub().GetStateByRange("PROPOSAL_", "PROPOSAL_~")
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	proposals := []*MultisigProposal{}
	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		var proposal MultisigProposal
		if err := json.Unmarshal(result.Value, &proposal); err != nil {
			continue
		}

		if status == "" || proposal.Status == status {
			proposals = append(proposals, &proposal)
		}
	}

	return proposals, nil
}

// UpdateConfig updates the multisig configuration
func (mm *MultisigManager) UpdateConfig(
	ctx contractapi.TransactionContextInterface,
	requiredSigs int,
	authorizedSigners []string,
) error {
	// This should itself require multisig approval in production
	if requiredSigs < 1 {
		return fmt.Errorf("requiredSigs must be at least 1")
	}
	if requiredSigs > len(authorizedSigners) {
		return fmt.Errorf("requiredSigs (%d) cannot exceed number of signers (%d)", requiredSigs, len(authorizedSigners))
	}

	mm.config.RequiredSignatures = requiredSigs
	mm.config.AuthorizedSigners = authorizedSigners

	// Save config to ledger
	configBytes, _ := json.Marshal(mm.config)
	return ctx.GetStub().PutState("MULTISIG_CONFIG", configBytes)
}

// Helper functions

func (mm *MultisigManager) isAuthorizedSigner(signer string) bool {
	for _, authorized := range mm.config.AuthorizedSigners {
		if authorized == signer {
			return true
		}
	}
	return false
}

func (mm *MultisigManager) generateProposalID(proposalType ProposalType, proposer string) string {
	timestamp := time.Now().UnixNano()
	data := fmt.Sprintf("%s:%s:%d", proposalType, proposer, timestamp)
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:16]) // First 16 bytes of hash
}

func (mm *MultisigManager) generateNonce(proposalID string, timestamp int64) string {
	data := fmt.Sprintf("%s:%d", proposalID, timestamp)
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

func (mm *MultisigManager) buildProposalMessage(proposal *MultisigProposal) []byte {
	// Build deterministic message for signing
	// Format: TYPE:PROPOSALID:NONCE:PAYLOAD_HASH
	payloadBytes, _ := json.Marshal(proposal.Payload)
	payloadHash := sha256.Sum256(payloadBytes)
	
	message := fmt.Sprintf("%s:%s:%s:%s",
		proposal.Type,
		proposal.ProposalID,
		proposal.Nonce,
		hex.EncodeToString(payloadHash[:]),
	)
	
	return []byte(message)
}

func (mm *MultisigManager) saveProposal(
	ctx contractapi.TransactionContextInterface,
	proposal *MultisigProposal,
) error {
	key := fmt.Sprintf("PROPOSAL_%s", proposal.ProposalID)
	proposalBytes, err := json.Marshal(proposal)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, proposalBytes)
}

// GetConfig returns the current multisig configuration
func (mm *MultisigManager) GetConfig() *MultisigConfig {
	return mm.config
}
