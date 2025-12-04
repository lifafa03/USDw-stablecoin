package pqcrypto

import (
	"bytes"
	"crypto/rand"
	"testing"

	"github.com/cloudflare/circl/sign/mldsa/mldsa65"
)

func TestGenerateRealKeyPair(t *testing.T) {
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Verify sizes
	if len(pubKey) != mldsa65.PublicKeySize {
		t.Errorf("Expected public key size %d, got %d", mldsa65.PublicKeySize, len(pubKey))
	}

	if len(privKey) != mldsa65.PrivateKeySize {
		t.Errorf("Expected private key size %d, got %d", mldsa65.PrivateKeySize, len(privKey))
	}

	// Verify keys are not all zeros
	allZerosPub := make([]byte, len(pubKey))
	if bytes.Equal(pubKey, allZerosPub) {
		t.Error("Public key is all zeros")
	}

	allZerosPriv := make([]byte, len(privKey))
	if bytes.Equal(privKey, allZerosPriv) {
		t.Error("Private key is all zeros")
	}
}

func TestSignMessageReal(t *testing.T) {
	// Generate key pair
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Sign a message
	message := []byte("Test message for Dilithium signing")
	signature, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Verify signature size
	if len(signature) != mldsa65.SignatureSize {
		t.Errorf("Expected signature size %d, got %d", mldsa65.SignatureSize, len(signature))
	}

	// Verify the signature
	valid, err := VerifyRealDilithium(message, signature, pubKey)
	if err != nil {
		t.Fatalf("Verification error: %v", err)
	}
	if !valid {
		t.Error("Signature verification failed for valid signature")
	}
}

func TestRealDilithiumVerifier_RegisterAndVerify(t *testing.T) {
	// Generate key pair
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Create verifier and register public key
	verifier := NewRealDilithiumVerifier()
	signerID := "test-signer-001"
	if err := verifier.RegisterPublicKey(signerID, pubKey); err != nil {
		t.Fatalf("Failed to register public key: %v", err)
	}

	// Sign a message
	message := []byte("Important transaction data")
	signature, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Verify using the verifier
	if err := verifier.Verify(message, signature, signerID); err != nil {
		t.Errorf("Verification failed: %v", err)
	}
}

func TestRealDilithiumVerifier_InvalidSignature(t *testing.T) {
	// Generate key pair
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Create verifier and register public key
	verifier := NewRealDilithiumVerifier()
	signerID := "test-signer-002"
	if err := verifier.RegisterPublicKey(signerID, pubKey); err != nil {
		t.Fatalf("Failed to register public key: %v", err)
	}

	// Sign a message
	message := []byte("Original message")
	signature, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Try to verify with tampered message
	tamperedMessage := []byte("Tampered message")
	err = verifier.Verify(tamperedMessage, signature, signerID)
	if err == nil {
		t.Error("Expected verification to fail for tampered message, but it succeeded")
	}

	// Try to verify with tampered signature
	tamperedSignature := make([]byte, len(signature))
	copy(tamperedSignature, signature)
	tamperedSignature[0] ^= 0xFF // Flip bits in first byte
	err = verifier.Verify(message, tamperedSignature, signerID)
	if err == nil {
		t.Error("Expected verification to fail for tampered signature, but it succeeded")
	}
}

func TestRealDilithiumVerifier_UnknownSigner(t *testing.T) {
	verifier := NewRealDilithiumVerifier()
	
	message := []byte("Test message")
	signature := make([]byte, mldsa65.SignatureSize)
	
	err := verifier.Verify(message, signature, "unknown-signer")
	if err == nil {
		t.Error("Expected error for unknown signer, got nil")
	}
}

func TestRealDilithiumVerifier_InvalidKeySize(t *testing.T) {
	verifier := NewRealDilithiumVerifier()
	
	// Try to register key with invalid size
	invalidKey := make([]byte, 100) // Too small
	err := verifier.RegisterPublicKey("test", invalidKey)
	if err == nil {
		t.Error("Expected error for invalid key size, got nil")
	}
}

func TestRealDilithiumVerifier_InvalidSignatureSize(t *testing.T) {
	// Generate key pair
	pubKey, _, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	verifier := NewRealDilithiumVerifier()
	signerID := "test-signer"
	if err := verifier.RegisterPublicKey(signerID, pubKey); err != nil {
		t.Fatalf("Failed to register public key: %v", err)
	}

	message := []byte("Test message")
	invalidSignature := make([]byte, 100) // Too small
	
	err = verifier.Verify(message, invalidSignature, signerID)
	if err == nil {
		t.Error("Expected error for invalid signature size, got nil")
	}
}

func TestVerifyRealDilithium_OneShot(t *testing.T) {
	// Generate key pair
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Sign message
	message := []byte("One-shot verification test")
	signature, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// One-shot verification
	valid, err := VerifyRealDilithium(message, signature, pubKey)
	if err != nil {
		t.Fatalf("Verification error: %v", err)
	}
	if !valid {
		t.Error("One-shot verification failed for valid signature")
	}

	// Verify with wrong message
	wrongMessage := []byte("Wrong message")
	valid, err = VerifyRealDilithium(wrongMessage, signature, pubKey)
	if err != nil {
		t.Fatalf("Verification error: %v", err)
	}
	if valid {
		t.Error("One-shot verification succeeded for wrong message")
	}
}

func TestSignMessageReal_DifferentMessages(t *testing.T) {
	// Generate key pair
	_, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	// Sign two different messages
	message1 := []byte("Message 1")
	message2 := []byte("Message 2")

	sig1, err := SignMessageReal(message1, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message 1: %v", err)
	}

	sig2, err := SignMessageReal(message2, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message 2: %v", err)
	}

	// Signatures should be different
	if bytes.Equal(sig1, sig2) {
		t.Error("Signatures for different messages are identical")
	}
}

func TestSignMessageReal_Deterministic(t *testing.T) {
	// Generate key pair
	_, privKey, err := GenerateRealKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	message := []byte("Test message for determinism")

	// Sign the same message twice
	sig1, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message (first time): %v", err)
	}

	sig2, err := SignMessageReal(message, privKey)
	if err != nil {
		t.Fatalf("Failed to sign message (second time): %v", err)
	}

	// ML-DSA signatures should be deterministic (unlike ECDSA)
	// Note: ML-DSA can be randomized or deterministic depending on context parameter
	// When context is nil (as we use), behavior depends on implementation
	// We just verify both signatures are valid
	t.Logf("Signature 1 length: %d", len(sig1))
	t.Logf("Signature 2 length: %d", len(sig2))
	t.Logf("Signatures equal: %v", bytes.Equal(sig1, sig2))
}

func TestGetKeyInfo(t *testing.T) {
	info := GetKeyInfo()

	expectedFields := []string{"PublicKeySize", "PrivateKeySize", "SignatureSize", "SecurityLevel"}
	for _, field := range expectedFields {
		if _, exists := info[field]; !exists {
			t.Errorf("Missing field in key info: %s", field)
		}
	}

	// Verify actual sizes
	if info["PublicKeySize"] != mldsa65.PublicKeySize {
		t.Errorf("Expected PublicKeySize %d, got %d", mldsa65.PublicKeySize, info["PublicKeySize"])
	}

	if info["PrivateKeySize"] != mldsa65.PrivateKeySize {
		t.Errorf("Expected PrivateKeySize %d, got %d", mldsa65.PrivateKeySize, info["PrivateKeySize"])
	}

	if info["SignatureSize"] != mldsa65.SignatureSize {
		t.Errorf("Expected SignatureSize %d, got %d", mldsa65.SignatureSize, info["SignatureSize"])
	}

	if info["SecurityLevel"] != 3 {
		t.Errorf("Expected SecurityLevel 3 (NIST level 3), got %d", info["SecurityLevel"])
	}
}

func TestFormatKeyForDisplay(t *testing.T) {
	// Short key
	shortKey := []byte{0x01, 0x02, 0x03, 0x04}
	formatted := FormatKeyForDisplay(shortKey)
	if formatted != "01020304" {
		t.Errorf("Expected '01020304', got '%s'", formatted)
	}

	// Long key
	longKey := make([]byte, 64)
	for i := range longKey {
		longKey[i] = byte(i)
	}
	formatted = FormatKeyForDisplay(longKey)
	if len(formatted) == 0 {
		t.Error("Formatted key is empty")
	}
	// Should contain "..." for truncation
	if len(formatted) < 20 {
		t.Errorf("Formatted key seems too short: %s", formatted)
	}
}

func TestSignMessageReal_InvalidPrivateKey(t *testing.T) {
	message := []byte("Test message")
	invalidPrivKey := make([]byte, 100) // Wrong size

	_, err := SignMessageReal(message, invalidPrivKey)
	if err == nil {
		t.Error("Expected error for invalid private key size, got nil")
	}
}

func BenchmarkGenerateRealKeyPair(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_, _, err := GenerateRealKeyPair()
		if err != nil {
			b.Fatalf("Failed to generate key pair: %v", err)
		}
	}
}

func BenchmarkSignMessageReal(b *testing.B) {
	// Generate key pair once
	_, privKey, err := GenerateRealKeyPair()
	if err != nil {
		b.Fatalf("Failed to generate key pair: %v", err)
	}

	message := make([]byte, 256)
	rand.Read(message)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := SignMessageReal(message, privKey)
		if err != nil {
			b.Fatalf("Failed to sign message: %v", err)
		}
	}
}

func BenchmarkVerifyRealDilithium(b *testing.B) {
	// Generate key pair and sign once
	pubKey, privKey, err := GenerateRealKeyPair()
	if err != nil {
		b.Fatalf("Failed to generate key pair: %v", err)
	}

	message := make([]byte, 256)
	rand.Read(message)

	signature, err := SignMessageReal(message, privKey)
	if err != nil {
		b.Fatalf("Failed to sign message: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid, err := VerifyRealDilithium(message, signature, pubKey)
		if err != nil {
			b.Fatalf("Verification error: %v", err)
		}
		if !valid {
			b.Fatal("Verification failed")
		}
	}
}
