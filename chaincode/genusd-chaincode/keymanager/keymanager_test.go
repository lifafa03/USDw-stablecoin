package keymanager

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/lifafa03/genusd-chaincode/pqcrypto"
)

func TestFileKeyManager_RegisterAndRetrieve(t *testing.T) {
	// Create temporary directory for keys
	tmpDir := t.TempDir()

	config := &Config{
		Type:    "file",
		KeyPath: tmpDir,
	}

	fkm, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create FileKeyManager: %v", err)
	}

	// Generate a test key pair
	pubKey, _, err := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, "test-key-001")
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Register the key
	role := "test_issuer"
	identifier := "test-key-001"
	err = fkm.RegisterKey(role, pubKey, identifier)
	if err != nil {
		t.Fatalf("Failed to register key: %v", err)
	}

	// Verify key exists
	if !fkm.KeyExists(role) {
		t.Error("KeyExists returned false for registered key")
	}

	// Retrieve the key
	retrievedKey, err := fkm.GetDilithiumPublicKey(role)
	if err != nil {
		t.Fatalf("Failed to retrieve key: %v", err)
	}

	// Verify key matches
	if retrievedKey.Identifier != identifier {
		t.Errorf("Expected identifier %s, got %s", identifier, retrievedKey.Identifier)
	}
	if retrievedKey.Mode != pqcrypto.Dilithium3 {
		t.Errorf("Expected mode Dilithium3, got %v", retrievedKey.Mode)
	}
}

func TestFileKeyManager_ListRoles(t *testing.T) {
	tmpDir := t.TempDir()
	config := &Config{Type: "file", KeyPath: tmpDir}
	fkm, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create FileKeyManager: %v", err)
	}

	// Register multiple keys
	roles := []string{"issuer", "auditor", "compliance"}
	for i, role := range roles {
		identifier := role + "-key"
		pubKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, identifier)
		if err := fkm.RegisterKey(role, pubKey, identifier); err != nil {
			t.Fatalf("Failed to register key %d: %v", i, err)
		}
	}

	// List roles
	listedRoles := fkm.ListRoles()
	if len(listedRoles) != len(roles) {
		t.Errorf("Expected %d roles, got %d", len(roles), len(listedRoles))
	}

	// Verify all roles present
	roleMap := make(map[string]bool)
	for _, r := range listedRoles {
		roleMap[r] = true
	}
	for _, expected := range roles {
		if !roleMap[expected] {
			t.Errorf("Role %s not found in list", expected)
		}
	}
}

func TestFileKeyManager_GetKeyMetadata(t *testing.T) {
	tmpDir := t.TempDir()
	config := &Config{Type: "file", KeyPath: tmpDir}
	fkm, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create FileKeyManager: %v", err)
	}

	// Register a key
	role := "test_role"
	identifier := "test-key"
	pubKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, identifier)
	before := time.Now().Unix()
	if err := fkm.RegisterKey(role, pubKey, identifier); err != nil {
		t.Fatalf("Failed to register key: %v", err)
	}
	after := time.Now().Unix()

	// Get metadata
	meta, err := fkm.GetKeyMetadata(role)
	if err != nil {
		t.Fatalf("Failed to get metadata: %v", err)
	}

	// Verify metadata
	if meta.Role != role {
		t.Errorf("Expected role %s, got %s", role, meta.Role)
	}
	if meta.Algorithm != "Dilithium3" {
		t.Errorf("Expected algorithm Dilithium3, got %s", meta.Algorithm)
	}
	if meta.Source != "file" {
		t.Errorf("Expected source 'file', got %s", meta.Source)
	}
	if meta.Identifier != identifier {
		t.Errorf("Expected identifier %s, got %s", identifier, meta.Identifier)
	}
	if meta.Created < before || meta.Created > after {
		t.Errorf("Creation timestamp %d outside range [%d, %d]", meta.Created, before, after)
	}
	if meta.LastUsed != 0 {
		t.Errorf("Expected LastUsed=0 (not yet accessed), got %d", meta.LastUsed)
	}

	// Access the key to update LastUsed
	time.Sleep(1 * time.Second) // Ensure timestamp is definitely after creation
	beforeAccess := time.Now().Unix()
	_, _ = fkm.GetDilithiumPublicKey(role)
	
	// Get metadata again
	meta2, err := fkm.GetKeyMetadata(role)
	if err != nil {
		t.Fatalf("Failed to get metadata after access: %v", err)
	}
	if meta2.LastUsed < beforeAccess {
		t.Errorf("Expected LastUsed (%d) >= beforeAccess (%d)", meta2.LastUsed, beforeAccess)
	}
	if meta2.LastUsed == 0 {
		t.Error("Expected LastUsed to be set after access, got 0")
	}
}

func TestFileKeyManager_PersistenceAcrossRestarts(t *testing.T) {
	tmpDir := t.TempDir()
	config := &Config{Type: "file", KeyPath: tmpDir}

	// Create first manager and register key
	fkm1, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create first FileKeyManager: %v", err)
	}

	role := "persistent_key"
	identifier := "persist-001"
	pubKey, _, _ := pqcrypto.GenerateMockKeyPair(pqcrypto.Dilithium3, identifier)
	if err := fkm1.RegisterKey(role, pubKey, identifier); err != nil {
		t.Fatalf("Failed to register key: %v", err)
	}

	// Verify key file exists
	keyFile := filepath.Join(tmpDir, role+".json")
	if _, err := os.Stat(keyFile); os.IsNotExist(err) {
		t.Fatalf("Key file %s was not created", keyFile)
	}

	// Create second manager (simulates restart)
	fkm2, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create second FileKeyManager: %v", err)
	}

	// Verify key loaded
	if !fkm2.KeyExists(role) {
		t.Error("Key not loaded after restart")
	}

	retrievedKey, err := fkm2.GetDilithiumPublicKey(role)
	if err != nil {
		t.Fatalf("Failed to retrieve key after restart: %v", err)
	}

	if retrievedKey.Identifier != identifier {
		t.Errorf("Key identifier mismatch after restart: expected %s, got %s", identifier, retrievedKey.Identifier)
	}
}

func TestFileKeyManager_NonExistentKey(t *testing.T) {
	tmpDir := t.TempDir()
	config := &Config{Type: "file", KeyPath: tmpDir}
	fkm, err := NewFileKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create FileKeyManager: %v", err)
	}

	role := "nonexistent"

	// Test KeyExists
	if fkm.KeyExists(role) {
		t.Error("KeyExists returned true for non-existent key")
	}

	// Test GetDilithiumPublicKey
	_, err = fkm.GetDilithiumPublicKey(role)
	if err == nil {
		t.Error("Expected error for non-existent key, got nil")
	}

	// Test GetKeyMetadata
	_, err = fkm.GetKeyMetadata(role)
	if err == nil {
		t.Error("Expected error for non-existent metadata, got nil")
	}
}

func TestHSMKeyManager_NotImplemented(t *testing.T) {
	config := &Config{
		Type:       "hsm",
		HSMLibrary: "/usr/lib/softhsm/libsofthsm2.so",
		HSMSlot:    0,
		HSMPin:     "1234",
	}

	hkm, err := NewHSMKeyManager(config)
	if err != nil {
		t.Fatalf("Failed to create HSMKeyManager: %v", err)
	}

	// Verify all methods return not-implemented errors
	_, err = hkm.GetDilithiumPublicKey("test")
	if err == nil {
		t.Error("Expected not-implemented error for GetDilithiumPublicKey")
	}

	_, err = hkm.VerifyDilithium("test", []byte("msg"), []byte("sig"))
	if err == nil {
		t.Error("Expected not-implemented error for VerifyDilithium")
	}

	// ListRoles and KeyExists should work (empty)
	roles := hkm.ListRoles()
	if len(roles) != 0 {
		t.Errorf("Expected 0 roles, got %d", len(roles))
	}

	if hkm.KeyExists("test") {
		t.Error("KeyExists returned true for empty HSM")
	}
}

func TestConfig_Validation(t *testing.T) {
	tests := []struct {
		name      string
		config    *Config
		expectErr bool
	}{
		{
			name:      "missing keyPath",
			config:    &Config{Type: "file", KeyPath: ""},
			expectErr: true,
		},
		{
			name:      "valid file config",
			config:    &Config{Type: "file", KeyPath: "/tmp/keys"},
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewFileKeyManager(tt.config)
			if (err != nil) != tt.expectErr {
				t.Errorf("Expected error=%v, got error=%v", tt.expectErr, err)
			}
		})
	}
}
