package keymanager

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/lifafa03/genusd-chaincode/pqcrypto"
)

// FileKeyManager implements KeyManager using file-based key storage
// This is the default implementation for development and testing
type FileKeyManager struct {
	keyPath    string
	keys       map[string]*pqcrypto.DilithiumPublicKey
	metadata   map[string]*KeyMetadata
	verifier   *pqcrypto.DilithiumVerifier
	mu         sync.RWMutex
	lastAccess map[string]int64
}

// keyFile represents the JSON structure for storing keys
type keyFile struct {
	Role       string `json:"role"`
	Mode       int    `json:"mode"`
	KeyBytes   string `json:"keyBytes"`   // hex-encoded
	Identifier string `json:"identifier"`
	Created    int64  `json:"created"`
}

// NewFileKeyManager creates a new file-based key manager
func NewFileKeyManager(config *Config) (*FileKeyManager, error) {
	if config.KeyPath == "" {
		return nil, fmt.Errorf("keyPath is required for file-based key manager")
	}

	// Ensure key directory exists
	if err := os.MkdirAll(config.KeyPath, 0700); err != nil {
		return nil, fmt.Errorf("failed to create key directory: %w", err)
	}

	fkm := &FileKeyManager{
		keyPath:    config.KeyPath,
		keys:       make(map[string]*pqcrypto.DilithiumPublicKey),
		metadata:   make(map[string]*KeyMetadata),
		verifier:   pqcrypto.NewDilithiumVerifier(),
		lastAccess: make(map[string]int64),
	}

	// Load existing keys
	if err := fkm.loadKeys(); err != nil {
		return nil, fmt.Errorf("failed to load keys: %w", err)
	}

	return fkm, nil
}

// GetDilithiumPublicKey retrieves a Dilithium public key for a given role
func (fkm *FileKeyManager) GetDilithiumPublicKey(role string) (*pqcrypto.DilithiumPublicKey, error) {
	fkm.mu.Lock()
	defer fkm.mu.Unlock()

	key, exists := fkm.keys[role]
	if !exists {
		return nil, NewKeyOperationError("GetDilithiumPublicKey", role, fmt.Errorf("key not found"))
	}

	// Update last access time
	fkm.lastAccess[role] = time.Now().Unix()

	return key, nil
}

// VerifyDilithium verifies a Dilithium signature for a given role
func (fkm *FileKeyManager) VerifyDilithium(role string, message, signatureBytes []byte) (bool, error) {
	fkm.mu.Lock()
	defer fkm.mu.Unlock()

	key, exists := fkm.keys[role]
	if !exists {
		return false, NewKeyOperationError("VerifyDilithium", role, fmt.Errorf("key not found"))
	}

	// Parse signature
	var sig pqcrypto.DilithiumSignature
	if err := json.Unmarshal(signatureBytes, &sig); err != nil {
		return false, NewKeyOperationError("VerifyDilithium", role, fmt.Errorf("invalid signature format: %w", err))
	}

	// Verify using the Dilithium verifier (using signerID instead of key object)
	err := fkm.verifier.Verify(message, &sig, key.Identifier)
	if err != nil {
		return false, nil // Verification failed (not an error condition)
	}

	// Update last access time
	fkm.lastAccess[role] = time.Now().Unix()

	return true, nil
}

// ListRoles returns all available roles with registered keys
func (fkm *FileKeyManager) ListRoles() []string {
	fkm.mu.RLock()
	defer fkm.mu.RUnlock()

	roles := make([]string, 0, len(fkm.keys))
	for role := range fkm.keys {
		roles = append(roles, role)
	}

	return roles
}

// KeyExists checks if a key exists for a given role
func (fkm *FileKeyManager) KeyExists(role string) bool {
	fkm.mu.RLock()
	defer fkm.mu.RUnlock()

	_, exists := fkm.keys[role]
	return exists
}

// GetKeyMetadata retrieves metadata about a key
func (fkm *FileKeyManager) GetKeyMetadata(role string) (*KeyMetadata, error) {
	fkm.mu.RLock()
	defer fkm.mu.RUnlock()

	meta, exists := fkm.metadata[role]
	if !exists {
		return nil, NewKeyOperationError("GetKeyMetadata", role, fmt.Errorf("metadata not found"))
	}

	// Create a copy to avoid race conditions
	metaCopy := *meta
	metaCopy.LastUsed = fkm.lastAccess[role]

	return &metaCopy, nil
}

// RegisterKey adds a new key to the file key manager
func (fkm *FileKeyManager) RegisterKey(role string, key *pqcrypto.DilithiumPublicKey, identifier string) error {
	fkm.mu.Lock()
	defer fkm.mu.Unlock()

	// Register in verifier
	if err := fkm.verifier.RegisterKey(identifier, key); err != nil {
		return NewKeyOperationError("RegisterKey", role, err)
	}

	// Store in memory
	fkm.keys[role] = key
	fkm.metadata[role] = &KeyMetadata{
		Role:       role,
		Algorithm:  fmt.Sprintf("Dilithium%d", key.Mode),
		Created:    time.Now().Unix(),
		LastUsed:   0,
		Source:     "file",
		Identifier: identifier,
	}
	fkm.lastAccess[role] = 0

	// Persist to disk
	return fkm.saveKey(role, key, identifier)
}

// loadKeys loads all keys from the key directory
func (fkm *FileKeyManager) loadKeys() error {
	files, err := filepath.Glob(filepath.Join(fkm.keyPath, "*.json"))
	if err != nil {
		return fmt.Errorf("failed to list key files: %w", err)
	}

	for _, file := range files {
		if err := fkm.loadKeyFile(file); err != nil {
			return fmt.Errorf("failed to load key file %s: %w", file, err)
		}
	}

	return nil
}

// loadKeyFile loads a single key file
func (fkm *FileKeyManager) loadKeyFile(filename string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return err
	}

	var kf keyFile
	if err := json.Unmarshal(data, &kf); err != nil {
		return err
	}

	// Decode hex key bytes
	keyBytes, err := hexDecode(kf.KeyBytes)
	if err != nil {
		return fmt.Errorf("invalid key bytes: %w", err)
	}

	// Create public key
	pubKey := &pqcrypto.DilithiumPublicKey{
		Mode:       pqcrypto.DilithiumMode(kf.Mode),
		KeyBytes:   keyBytes,
		Identifier: kf.Identifier,
	}

	// Register in verifier
	if err := fkm.verifier.RegisterKey(kf.Identifier, pubKey); err != nil {
		return err
	}

	// Store in memory
	fkm.keys[kf.Role] = pubKey
	fkm.metadata[kf.Role] = &KeyMetadata{
		Role:       kf.Role,
		Algorithm:  fmt.Sprintf("Dilithium%d", kf.Mode),
		Created:    kf.Created,
		LastUsed:   0,
		Source:     "file",
		Identifier: kf.Identifier,
	}
	fkm.lastAccess[kf.Role] = 0

	return nil
}

// saveKey saves a key to disk
func (fkm *FileKeyManager) saveKey(role string, key *pqcrypto.DilithiumPublicKey, identifier string) error {
	kf := keyFile{
		Role:       role,
		Mode:       int(key.Mode),
		KeyBytes:   hexEncode(key.KeyBytes),
		Identifier: identifier,
		Created:    time.Now().Unix(),
	}

	data, err := json.MarshalIndent(kf, "", "  ")
	if err != nil {
		return err
	}

	filename := filepath.Join(fkm.keyPath, role+".json")
	return os.WriteFile(filename, data, 0600)
}

// hexEncode converts bytes to hex string
func hexEncode(data []byte) string {
	return fmt.Sprintf("%x", data)
}

// hexDecode converts hex string to bytes
func hexDecode(s string) ([]byte, error) {
	var result []byte
	for i := 0; i < len(s); i += 2 {
		var b byte
		_, err := fmt.Sscanf(s[i:i+2], "%02x", &b)
		if err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, nil
}
