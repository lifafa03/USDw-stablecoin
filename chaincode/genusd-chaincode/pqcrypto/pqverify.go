package pqcrypto

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"

	"golang.org/x/crypto/sha3"
)

// DilithiumMode represents the security level of Dilithium
type DilithiumMode int

const (
	// Dilithium2 provides NIST security level 2 (equivalent to AES-128)
	Dilithium2 DilithiumMode = 2
	// Dilithium3 provides NIST security level 3 (equivalent to AES-192)
	Dilithium3 DilithiumMode = 3
	// Dilithium5 provides NIST security level 5 (equivalent to AES-256)
	Dilithium5 DilithiumMode = 5
)

// DilithiumPublicKey represents a Dilithium public key
type DilithiumPublicKey struct {
	Mode      DilithiumMode
	KeyBytes  []byte
	Identifier string // human-readable identifier (e.g., "issuer", "auditor")
}

// DilithiumSignature represents a Dilithium signature
type DilithiumSignature struct {
	Mode      DilithiumMode
	SignatureBytes []byte
	Timestamp int64
	Signer    string
}

// DilithiumVerifier handles post-quantum signature verification
type DilithiumVerifier struct {
	keys map[string]*DilithiumPublicKey
	mu   sync.RWMutex
}

// NewDilithiumVerifier creates a new Dilithium verifier
func NewDilithiumVerifier() *DilithiumVerifier {
	return &DilithiumVerifier{
		keys: make(map[string]*DilithiumPublicKey),
	}
}

// RegisterKey registers a Dilithium public key for verification
func (dv *DilithiumVerifier) RegisterKey(identifier string, pubKey *DilithiumPublicKey) error {
	dv.mu.Lock()
	defer dv.mu.Unlock()

	if identifier == "" {
		return errors.New("identifier cannot be empty")
	}

	if pubKey == nil {
		return errors.New("public key cannot be nil")
	}

	// Validate key size based on mode
	expectedSize := getPublicKeySize(pubKey.Mode)
	if len(pubKey.KeyBytes) != expectedSize {
		return fmt.Errorf("invalid public key size for mode %d: expected %d, got %d",
			pubKey.Mode, expectedSize, len(pubKey.KeyBytes))
	}

	pubKey.Identifier = identifier
	dv.keys[identifier] = pubKey
	return nil
}

// GetKey retrieves a registered public key
func (dv *DilithiumVerifier) GetKey(identifier string) (*DilithiumPublicKey, error) {
	dv.mu.RLock()
	defer dv.mu.RUnlock()

	key, exists := dv.keys[identifier]
	if !exists {
		return nil, fmt.Errorf("public key not found for identifier: %s", identifier)
	}

	return key, nil
}

// Verify verifies a Dilithium signature
// NOTE: This is a MOCK implementation for Phase 3
// In production, integrate with PQClean or liboqs for real Dilithium verification
func (dv *DilithiumVerifier) Verify(message []byte, signature *DilithiumSignature, signerID string) error {
	dv.mu.RLock()
	pubKey, exists := dv.keys[signerID]
	dv.mu.RUnlock()

	if !exists {
		return fmt.Errorf("public key not registered for signer: %s", signerID)
	}

	// Validate signature size
	expectedSigSize := getSignatureSize(signature.Mode)
	if len(signature.SignatureBytes) != expectedSigSize {
		return fmt.Errorf("invalid signature size for mode %d: expected %d, got %d",
			signature.Mode, expectedSigSize, len(signature.SignatureBytes))
	}

	// Validate mode consistency
	if pubKey.Mode != signature.Mode {
		return fmt.Errorf("mode mismatch: key mode %d, signature mode %d", pubKey.Mode, signature.Mode)
	}

	// === MOCK VERIFICATION LOGIC ===
	// In production, replace with actual Dilithium verification from PQClean
	// Real verification: return dilithium_verify(message, signature, pubKey)
	
	// For Phase 3 mock: verify deterministic hash-based signature
	expectedSig := generateMockSignature(message, pubKey.KeyBytes, signature.Mode)
	
	if !constantTimeCompare(signature.SignatureBytes, expectedSig) {
		return errors.New("signature verification failed: invalid signature")
	}

	return nil
}

// VerifyWithContext verifies a signature with additional context
func (dv *DilithiumVerifier) VerifyWithContext(message []byte, signature *DilithiumSignature, signerID string, context []byte) error {
	// Append context to message for domain separation
	contextualMessage := append(message, context...)
	return dv.Verify(contextualMessage, signature, signerID)
}

// ListRegisteredKeys returns all registered key identifiers
func (dv *DilithiumVerifier) ListRegisteredKeys() []string {
	dv.mu.RLock()
	defer dv.mu.RUnlock()

	identifiers := make([]string, 0, len(dv.keys))
	for id := range dv.keys {
		identifiers = append(identifiers, id)
	}
	return identifiers
}

// === Helper Functions ===

// getPublicKeySize returns the expected public key size for each Dilithium mode
func getPublicKeySize(mode DilithiumMode) int {
	switch mode {
	case Dilithium2:
		return 1312 // Dilithium2 public key size
	case Dilithium3:
		return 1952 // Dilithium3 public key size
	case Dilithium5:
		return 2592 // Dilithium5 public key size
	default:
		return 0
	}
}

// getSignatureSize returns the expected signature size for each Dilithium mode
func getSignatureSize(mode DilithiumMode) int {
	switch mode {
	case Dilithium2:
		return 2420 // Dilithium2 signature size
	case Dilithium3:
		return 3293 // Dilithium3 signature size
	case Dilithium5:
		return 4595 // Dilithium5 signature size
	default:
		return 0
	}
}

// generateMockSignature generates a deterministic mock signature
// PRODUCTION NOTE: Replace with actual Dilithium signing
func generateMockSignature(message []byte, pubKey []byte, mode DilithiumMode) []byte {
	// Use SHAKE256 (extendable-output function) for deterministic signature generation
	h := sha3.NewShake256()
	h.Write([]byte("DILITHIUM_MOCK_SIG_V1"))
	h.Write(pubKey)
	h.Write(message)
	
	sigSize := getSignatureSize(mode)
	signature := make([]byte, sigSize)
	h.Read(signature)
	
	return signature
}

// constantTimeCompare performs constant-time comparison to prevent timing attacks
func constantTimeCompare(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	
	return v == 0
}

// GenerateMockKeyPair generates a mock Dilithium key pair for testing
// PRODUCTION NOTE: Replace with actual Dilithium key generation
func GenerateMockKeyPair(mode DilithiumMode, identifier string) (*DilithiumPublicKey, []byte, error) {
	pubKeySize := getPublicKeySize(mode)
	if pubKeySize == 0 {
		return nil, nil, fmt.Errorf("invalid Dilithium mode: %d", mode)
	}

	// Generate random public key (in production, this would come from Dilithium keygen)
	pubKeyBytes := make([]byte, pubKeySize)
	if _, err := rand.Read(pubKeyBytes); err != nil {
		return nil, nil, fmt.Errorf("failed to generate public key: %w", err)
	}

	// Generate mock private key (in production, use Dilithium private key format)
	privKeyBytes := make([]byte, pubKeySize*2) // Mock: private key is 2x public key size
	if _, err := rand.Read(privKeyBytes); err != nil {
		return nil, nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	pubKey := &DilithiumPublicKey{
		Mode:       mode,
		KeyBytes:   pubKeyBytes,
		Identifier: identifier,
	}

	return pubKey, privKeyBytes, nil
}

// SignMessage creates a mock Dilithium signature
// PRODUCTION NOTE: Replace with actual Dilithium signing
func SignMessage(message []byte, privKey []byte, mode DilithiumMode, signerID string) (*DilithiumSignature, error) {
	// Derive public key from private key (mock operation)
	pubKeySize := getPublicKeySize(mode)
	if len(privKey) < pubKeySize {
		return nil, errors.New("invalid private key size")
	}
	
	pubKey := privKey[:pubKeySize] // Mock: extract public key portion
	signatureBytes := generateMockSignature(message, pubKey, mode)

	return &DilithiumSignature{
		Mode:           mode,
		SignatureBytes: signatureBytes,
		Timestamp:      getCurrentTimestamp(),
		Signer:         signerID,
	}, nil
}

// HashMessage creates a SHA3-256 hash of a message for signing
func HashMessage(message []byte) []byte {
	hash := sha3.Sum256(message)
	return hash[:]
}

// HashMessageHex returns hex-encoded SHA3-256 hash
func HashMessageHex(message []byte) string {
	hash := HashMessage(message)
	return hex.EncodeToString(hash)
}

// ComputeSHA256 computes SHA2-256 hash (for compatibility)
func ComputeSHA256(data []byte) []byte {
	hash := sha256.Sum256(data)
	return hash[:]
}

// getCurrentTimestamp returns current Unix timestamp
func getCurrentTimestamp() int64 {
	return 1732752000 // Mock timestamp for deterministic testing
	// In production: return time.Now().Unix()
}

// SerializePublicKey exports a public key to JSON-compatible format
func (pk *DilithiumPublicKey) SerializePublicKey() map[string]interface{} {
	return map[string]interface{}{
		"mode":       int(pk.Mode),
		"key_bytes":  hex.EncodeToString(pk.KeyBytes),
		"identifier": pk.Identifier,
	}
}

// SerializeSignature exports a signature to JSON-compatible format
func (sig *DilithiumSignature) SerializeSignature() map[string]interface{} {
	return map[string]interface{}{
		"mode":            int(sig.Mode),
		"signature_bytes": hex.EncodeToString(sig.SignatureBytes),
		"timestamp":       sig.Timestamp,
		"signer":          sig.Signer,
	}
}
