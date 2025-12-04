package pqcrypto

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

// RealDilithiumVerifier implements production Dilithium (ML-DSA) verification
// using Cloudflare's CIRCL library with NIST-standardized ML-DSA-65
type RealDilithiumVerifier struct {
	keys map[string]*mldsa65.PublicKey
}

// NewRealDilithiumVerifier creates a new real Dilithium verifier
func NewRealDilithiumVerifier() *RealDilithiumVerifier {
	return &RealDilithiumVerifier{
		keys: make(map[string]*mldsa65.PublicKey),
	}
}

// RegisterPublicKey registers a public key for verification
func (rdv *RealDilithiumVerifier) RegisterPublicKey(identifier string, pubKeyBytes []byte) error {
	if len(pubKeyBytes) != mldsa65.PublicKeySize {
		return fmt.Errorf("invalid public key size: expected %d, got %d", mldsa65.PublicKeySize, len(pubKeyBytes))
	}

	pubKey := new(mldsa65.PublicKey)
	if err := pubKey.UnmarshalBinary(pubKeyBytes); err != nil {
		return fmt.Errorf("failed to unmarshal public key: %w", err)
	}

	rdv.keys[identifier] = pubKey
	return nil
}

// Verify verifies a Dilithium signature using ML-DSA-65
func (rdv *RealDilithiumVerifier) Verify(message []byte, signatureBytes []byte, signerID string) error {
	pubKey, exists := rdv.keys[signerID]
	if !exists {
		return fmt.Errorf("public key not found for signer: %s", signerID)
	}

	if len(signatureBytes) != mldsa65.SignatureSize {
		return fmt.Errorf("invalid signature size: expected %d, got %d", mldsa65.SignatureSize, len(signatureBytes))
	}

	// ML-DSA-65 verification
	if !mldsa65.Verify(pubKey, message, nil, signatureBytes) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}

// GenerateKeyPair generates a new Dilithium (ML-DSA-65) key pair
func GenerateRealKeyPair() (publicKey []byte, privateKey []byte, err error) {
	pub, priv, err := mldsa65.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate key pair: %w", err)
	}

	pubBytes, err := pub.MarshalBinary()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to marshal public key: %w", err)
	}

	privBytes, err := priv.MarshalBinary()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to marshal private key: %w", err)
	}

	return pubBytes, privBytes, nil
}

// SignMessage signs a message with Dilithium (ML-DSA-65) private key
func SignMessageReal(message []byte, privateKeyBytes []byte) ([]byte, error) {
	if len(privateKeyBytes) != mldsa65.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key size: expected %d, got %d", mldsa65.PrivateKeySize, len(privateKeyBytes))
	}

	privKey := new(mldsa65.PrivateKey)
	if err := privKey.UnmarshalBinary(privateKeyBytes); err != nil {
		return nil, fmt.Errorf("failed to unmarshal private key: %w", err)
	}

	// Sign with ML-DSA-65 (context is nil, deterministic mode)
	signature := make([]byte, mldsa65.SignatureSize)
	if err := mldsa65.SignTo(privKey, message, nil, false, signature); err != nil {
		return nil, fmt.Errorf("signing failed: %w", err)
	}

	return signature, nil
}

// ConvertMockToDilithiumPublicKey converts a mock DilithiumPublicKey to real ML-DSA format
// This is for backward compatibility during migration
func ConvertMockToDilithiumPublicKey(mockKey *DilithiumPublicKey) ([]byte, error) {
	// If the key is already the correct size for ML-DSA-65, return it
	if len(mockKey.KeyBytes) == mldsa65.PublicKeySize {
		return mockKey.KeyBytes, nil
	}

	// Otherwise, this is a mock key that needs regeneration
	return nil, fmt.Errorf("mock key detected (size %d), must regenerate with GenerateRealKeyPair()", len(mockKey.KeyBytes))
}

// VerifyRealDilithium is a convenience function for one-shot verification
func VerifyRealDilithium(message, signature, publicKey []byte) (bool, error) {
	if len(publicKey) != mldsa65.PublicKeySize {
		return false, fmt.Errorf("invalid public key size: %d", len(publicKey))
	}

	if len(signature) != mldsa65.SignatureSize {
		return false, fmt.Errorf("invalid signature size: %d", len(signature))
	}

	pubKey := new(mldsa65.PublicKey)
	if err := pubKey.UnmarshalBinary(publicKey); err != nil {
		return false, fmt.Errorf("invalid public key: %w", err)
	}

	valid := mldsa65.Verify(pubKey, message, nil, signature)
	return valid, nil
}

// GetKeyInfo returns information about ML-DSA-65 key sizes
func GetKeyInfo() map[string]int {
	return map[string]int{
		"PublicKeySize":  mldsa65.PublicKeySize,
		"PrivateKeySize": mldsa65.PrivateKeySize,
		"SignatureSize":  mldsa65.SignatureSize,
		"SecurityLevel":  3, // ML-DSA-65 provides NIST security level 3 (AES-192 equivalent)
	}
}

// FormatKeyForDisplay returns a hex-encoded short representation of a key
func FormatKeyForDisplay(keyBytes []byte) string {
	if len(keyBytes) < 16 {
		return hex.EncodeToString(keyBytes)
	}
	return hex.EncodeToString(keyBytes[:8]) + "..." + hex.EncodeToString(keyBytes[len(keyBytes)-8:])
}
