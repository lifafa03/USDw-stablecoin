package keymanager

import (
	"github.com/lifafa03/genusd-chaincode/pqcrypto"
)

// KeyManager provides an abstraction for cryptographic key management
// This interface allows for easy migration to HSM or Cloud KMS in the future
type KeyManager interface {
	// GetDilithiumPublicKey retrieves a Dilithium public key for a given role
	GetDilithiumPublicKey(role string) (*pqcrypto.DilithiumPublicKey, error)

	// VerifyDilithium verifies a Dilithium signature for a given role
	VerifyDilithium(role string, message, signature []byte) (bool, error)

	// ListRoles returns all available roles with registered keys
	ListRoles() []string

	// KeyExists checks if a key exists for a given role
	KeyExists(role string) bool

	// GetKeyMetadata retrieves metadata about a key (created, last used, etc.)
	GetKeyMetadata(role string) (*KeyMetadata, error)
}

// KeyMetadata provides information about a cryptographic key
type KeyMetadata struct {
	Role       string
	Algorithm  string // e.g., "Dilithium3", "Dilithium5"
	Created    int64  // Unix timestamp
	LastUsed   int64  // Unix timestamp
	Source     string // e.g., "file", "hsm", "kms"
	Identifier string // Human-readable identifier
}

// Config provides configuration for key managers
type Config struct {
	// Type specifies the key manager type: "file", "hsm", "kms"
	Type string

	// KeyPath for file-based key manager
	KeyPath string

	// HSM configuration
	HSMLibrary string // Path to PKCS#11 library
	HSMSlot    uint   // HSM slot number
	HSMPin     string // HSM PIN (in production, use secure secret management)

	// KMS configuration
	KMSProvider string // e.g., "aws", "gcp", "azure"
	KMSRegion   string
	KMSKeyID    string
}

// KeyOperationError represents an error during key operations
type KeyOperationError struct {
	Operation string
	Role      string
	Err       error
}

func (e *KeyOperationError) Error() string {
	return "keymanager: " + e.Operation + " failed for role '" + e.Role + "': " + e.Err.Error()
}

// NewKeyOperationError creates a new key operation error
func NewKeyOperationError(operation, role string, err error) *KeyOperationError {
	return &KeyOperationError{
		Operation: operation,
		Role:      role,
		Err:       err,
	}
}
