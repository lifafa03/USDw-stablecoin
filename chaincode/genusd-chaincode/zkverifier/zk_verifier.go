package zkverifier

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"golang.org/x/crypto/sha3"
)

// ZKVerifier interface for both mock and real verifiers
type ZKVerifier interface {
	VerifyProof(proof *STARKProof) (bool, error)
	VerifyAndStoreCommitment(ctx contractapi.TransactionContextInterface, proof *STARKProof) error
	GetCommitment(ctx contractapi.TransactionContextInterface, commitment string) (*CommitmentRecord, error)
	IsNullifierUsed(ctx contractapi.TransactionContextInterface, nullifier string) (bool, error)
	MarkCommitmentUsed(ctx contractapi.TransactionContextInterface, commitment string, txID string) error
}

// STARKProof represents a STARK zero-knowledge proof
type STARKProof struct {
	ProofBytes    []byte                 `json:"proof_bytes"`
	PublicInputs  []string               `json:"public_inputs"`
	Commitment    string                 `json:"commitment"`
	Nullifier     string                 `json:"nullifier"`
	ProofMetadata map[string]interface{} `json:"proof_metadata"`
	Timestamp     int64                  `json:"timestamp"`
}

// CommitmentRecord tracks on-chain commitments
type CommitmentRecord struct {
	Commitment  string `json:"commitment"`
	Nullifier   string `json:"nullifier"`
	Timestamp   int64  `json:"timestamp"`
	Used        bool   `json:"used"`
	Transaction string `json:"transaction"`
}

// STARKVerifier handles STARK proof verification
type STARKVerifier struct {
	commitments map[string]*CommitmentRecord
	nullifiers  map[string]bool
	mu          sync.RWMutex
}

// NewSTARKVerifier creates a new STARK verifier
func NewSTARKVerifier() *STARKVerifier {
	return &STARKVerifier{
		commitments: make(map[string]*CommitmentRecord),
		nullifiers:  make(map[string]bool),
	}
}

// VerifyProof verifies a STARK proof
// NOTE: This is a MOCK implementation for Phase 3
// In production, integrate with Winterfell, Stone, or custom STARK verifier
func (sv *STARKVerifier) VerifyProof(proof *STARKProof) (bool, error) {
	if proof == nil {
		return false, errors.New("proof cannot be nil")
	}

	// Validate proof structure
	if len(proof.ProofBytes) == 0 {
		return false, errors.New("proof bytes cannot be empty")
	}

	if proof.Commitment == "" {
		return false, errors.New("commitment cannot be empty")
	}

	if proof.Nullifier == "" {
		return false, errors.New("nullifier cannot be empty")
	}

	// Check nullifier hasn't been used (prevent double-spend)
	sv.mu.RLock()
	if sv.nullifiers[proof.Nullifier] {
		sv.mu.RUnlock()
		return false, fmt.Errorf("nullifier %s already used", proof.Nullifier)
	}
	sv.mu.RUnlock()

	// === MOCK VERIFICATION LOGIC ===
	// In production, replace with actual STARK verification
	// Real verification: return winterfell_verify(proof, public_inputs, commitment)

	// Verify commitment integrity
	computedCommitment := sv.computeCommitment(proof.PublicInputs, proof.Nullifier)
	if computedCommitment != proof.Commitment {
		return false, errors.New("commitment mismatch")
	}

	// Mock: Verify proof hash is consistent
	expectedProofHash := sv.computeProofHash(proof.ProofBytes, proof.PublicInputs)
	if len(expectedProofHash) == 0 {
		return false, errors.New("invalid proof hash")
	}

	// In production, perform actual polynomial commitment verification,
	// FRI protocol verification, constraint system checks, etc.

	return true, nil
}

// VerifyAndStoreCommitment verifies proof and stores commitment on-chain
func (sv *STARKVerifier) VerifyAndStoreCommitment(
	ctx contractapi.TransactionContextInterface,
	proof *STARKProof,
) error {
	// Verify the proof
	valid, err := sv.VerifyProof(proof)
	if err != nil {
		return fmt.Errorf("proof verification failed: %w", err)
	}

	if !valid {
		return errors.New("proof is invalid")
	}

	// Check if commitment already exists
	commitmentKey := fmt.Sprintf("COMMITMENT_%s", proof.Commitment)
	existing, err := ctx.GetStub().GetState(commitmentKey)
	if err != nil {
		return fmt.Errorf("failed to check commitment: %w", err)
	}

	if existing != nil {
		return fmt.Errorf("commitment %s already exists", proof.Commitment)
	}

	// Check nullifier hasn't been used
	nullifierKey := fmt.Sprintf("NULLIFIER_%s", proof.Nullifier)
	existingNullifier, err := ctx.GetStub().GetState(nullifierKey)
	if err != nil {
		return fmt.Errorf("failed to check nullifier: %w", err)
	}

	if existingNullifier != nil {
		return fmt.Errorf("nullifier %s already used (double-spend attempt)", proof.Nullifier)
	}

	// Store commitment
	record := CommitmentRecord{
		Commitment:  proof.Commitment,
		Nullifier:   proof.Nullifier,
		Timestamp:   proof.Timestamp,
		Used:        false,
		Transaction: ctx.GetStub().GetTxID(),
	}

	recordBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal record: %w", err)
	}

	if err := ctx.GetStub().PutState(commitmentKey, recordBytes); err != nil {
		return fmt.Errorf("failed to store commitment: %w", err)
	}

	// Store nullifier to prevent reuse
	if err := ctx.GetStub().PutState(nullifierKey, []byte("1")); err != nil {
		return fmt.Errorf("failed to store nullifier: %w", err)
	}

	// Mark nullifier as used in memory
	sv.mu.Lock()
	sv.nullifiers[proof.Nullifier] = true
	sv.commitments[proof.Commitment] = &record
	sv.mu.Unlock()

	// Emit event
	eventData, _ := json.Marshal(map[string]interface{}{
		"commitment": proof.Commitment,
		"nullifier":  proof.Nullifier,
		"timestamp":  proof.Timestamp,
	})
	ctx.GetStub().SetEvent("CommitmentStored", eventData)

	return nil
}

// GetCommitment retrieves a commitment record
func (sv *STARKVerifier) GetCommitment(
	ctx contractapi.TransactionContextInterface,
	commitment string,
) (*CommitmentRecord, error) {
	commitmentKey := fmt.Sprintf("COMMITMENT_%s", commitment)
	recordBytes, err := ctx.GetStub().GetState(commitmentKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read commitment: %w", err)
	}

	if recordBytes == nil {
		return nil, fmt.Errorf("commitment %s not found", commitment)
	}

	var record CommitmentRecord
	if err := json.Unmarshal(recordBytes, &record); err != nil {
		return nil, fmt.Errorf("failed to unmarshal record: %w", err)
	}

	return &record, nil
}

// IsNullifierUsed checks if a nullifier has been used
func (sv *STARKVerifier) IsNullifierUsed(
	ctx contractapi.TransactionContextInterface,
	nullifier string,
) (bool, error) {
	nullifierKey := fmt.Sprintf("NULLIFIER_%s", nullifier)
	nullifierBytes, err := ctx.GetStub().GetState(nullifierKey)
	if err != nil {
		return false, fmt.Errorf("failed to check nullifier: %w", err)
	}

	return nullifierBytes != nil, nil
}

// MarkCommitmentUsed marks a commitment as used
func (sv *STARKVerifier) MarkCommitmentUsed(
	ctx contractapi.TransactionContextInterface,
	commitment string,
	txID string,
) error {
	record, err := sv.GetCommitment(ctx, commitment)
	if err != nil {
		return err
	}

	if record.Used {
		return fmt.Errorf("commitment %s already used", commitment)
	}

	record.Used = true
	record.Transaction = txID

	commitmentKey := fmt.Sprintf("COMMITMENT_%s", commitment)
	updatedBytes, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal record: %w", err)
	}

	return ctx.GetStub().PutState(commitmentKey, updatedBytes)
}

// === Helper Functions ===

// computeCommitment computes a commitment hash from public inputs and nullifier
func (sv *STARKVerifier) computeCommitment(publicInputs []string, nullifier string) string {
	h := sha3.New256()
	h.Write([]byte("STARK_COMMITMENT_V1"))
	
	for _, input := range publicInputs {
		h.Write([]byte(input))
	}
	
	h.Write([]byte(nullifier))
	
	return hex.EncodeToString(h.Sum(nil))
}

// computeProofHash computes a hash of the proof for integrity checking
func (sv *STARKVerifier) computeProofHash(proofBytes []byte, publicInputs []string) string {
	h := sha256.New()
	h.Write([]byte("STARK_PROOF_HASH_V1"))
	h.Write(proofBytes)
	
	for _, input := range publicInputs {
		h.Write([]byte(input))
	}
	
	return hex.EncodeToString(h.Sum(nil))
}

// CreateMockProof creates a mock STARK proof for testing
func CreateMockProof(publicInputs []string, nullifier string, timestamp int64) *STARKProof {
	// Generate deterministic proof bytes
	h := sha3.New512()
	h.Write([]byte("MOCK_STARK_PROOF"))
	for _, input := range publicInputs {
		h.Write([]byte(input))
	}
	h.Write([]byte(nullifier))
	proofBytes := h.Sum(nil)

	// Compute commitment
	sv := NewSTARKVerifier()
	commitment := sv.computeCommitment(publicInputs, nullifier)

	return &STARKProof{
		ProofBytes:   proofBytes,
		PublicInputs: publicInputs,
		Commitment:   commitment,
		Nullifier:    nullifier,
		ProofMetadata: map[string]interface{}{
			"proof_system": "STARK",
			"security_level": 128,
			"version":      "mock_v1",
		},
		Timestamp: timestamp,
	}
}

// ValidateProofStructure validates the structure of a proof without full verification
func ValidateProofStructure(proof *STARKProof) error {
	if proof == nil {
		return errors.New("proof is nil")
	}

	if len(proof.ProofBytes) < 32 {
		return errors.New("proof bytes too short")
	}

	if len(proof.PublicInputs) == 0 {
		return errors.New("no public inputs provided")
	}

	if proof.Commitment == "" {
		return errors.New("commitment is empty")
	}

	if proof.Nullifier == "" {
		return errors.New("nullifier is empty")
	}

	if proof.Timestamp <= 0 {
		return errors.New("invalid timestamp")
	}

	return nil
}

// SerializeProof exports a proof to JSON format
func (proof *STARKProof) SerializeProof() map[string]interface{} {
	return map[string]interface{}{
		"proof_bytes":    hex.EncodeToString(proof.ProofBytes),
		"public_inputs":  proof.PublicInputs,
		"commitment":     proof.Commitment,
		"nullifier":      proof.Nullifier,
		"proof_metadata": proof.ProofMetadata,
		"timestamp":      proof.Timestamp,
	}
}
