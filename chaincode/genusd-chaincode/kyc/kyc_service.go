package kyc

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// KYCService handles KYC operations
type KYCService struct {
	// In production, this would connect to external KYC provider APIs
	// For now, it's a self-contained service
}

// NewKYCService creates a new KYC service
func NewKYCService() *KYCService {
	return &KYCService{}
}

// RegisterUser creates a new KYC record
func (ks *KYCService) RegisterUser(
	ctx contractapi.TransactionContextInterface,
	userID string,
	fullName string,
	country string,
	tier KYCTier,
) error {
	// Check if already registered
	existing, _ := ks.GetKYCRecord(ctx, userID)
	if existing != nil {
		return fmt.Errorf("user %s already registered", userID)
	}

	// Create KYC record
	record := &KYCRecord{
		UserID:       userID,
		Status:       KYCPending,
		Tier:         tier,
		CreatedAt:    time.Now().Unix(),
		UpdatedAt:    time.Now().Unix(),
		FullName:     fullName,
		Country:      country,
		DailyLimit:   tier.GetDailyLimit(),
		MonthlyLimit: tier.GetMonthlyLimit(),
		RiskScore:    50, // Default medium risk
		Metadata:     make(map[string]interface{}),
	}

	return ks.saveKYCRecord(ctx, record)
}

// ApproveKYC approves a KYC record
func (ks *KYCService) ApproveKYC(
	ctx contractapi.TransactionContextInterface,
	userID string,
	reviewer string,
	tier KYCTier,
	validityDays int,
) error {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return err
	}

	now := time.Now().Unix()
	record.Status = KYCApproved
	record.ApprovedAt = now
	record.UpdatedAt = now
	record.ReviewedBy = reviewer
	record.Tier = tier
	record.DailyLimit = tier.GetDailyLimit()
	record.MonthlyLimit = tier.GetMonthlyLimit()

	if validityDays > 0 {
		record.ExpiresAt = now + int64(validityDays*86400)
	}

	return ks.saveKYCRecord(ctx, record)
}

// RejectKYC rejects a KYC application
func (ks *KYCService) RejectKYC(
	ctx contractapi.TransactionContextInterface,
	userID string,
	reviewer string,
	reason string,
) error {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return err
	}

	record.Status = KYCRejected
	record.UpdatedAt = time.Now().Unix()
	record.ReviewedBy = reviewer
	record.Notes = reason

	return ks.saveKYCRecord(ctx, record)
}

// UpdateKYCTier updates the verification tier
func (ks *KYCService) UpdateKYCTier(
	ctx contractapi.TransactionContextInterface,
	userID string,
	newTier KYCTier,
) error {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return err
	}

	record.Tier = newTier
	record.DailyLimit = newTier.GetDailyLimit()
	record.MonthlyLimit = newTier.GetMonthlyLimit()
	record.UpdatedAt = time.Now().Unix()

	return ks.saveKYCRecord(ctx, record)
}

// AddToBlacklist adds a user to the blacklist
func (ks *KYCService) AddToBlacklist(
	ctx contractapi.TransactionContextInterface,
	userID string,
	reason string,
	addedBy string,
) error {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return err
	}

	record.IsBlacklisted = true
	record.BlacklistReason = reason
	record.UpdatedAt = time.Now().Unix()

	// Create blacklist entry
	entry := &BlacklistEntry{
		EntityID:   userID,
		EntityType: "user",
		Reason:     reason,
		AddedAt:    time.Now().Unix(),
		AddedBy:    addedBy,
		IsActive:   true,
	}

	blacklistKey := fmt.Sprintf("BLACKLIST_%s", userID)
	entryBytes, _ := json.Marshal(entry)
	ctx.GetStub().PutState(blacklistKey, entryBytes)

	return ks.saveKYCRecord(ctx, record)
}

// RemoveFromBlacklist removes a user from the blacklist
func (ks *KYCService) RemoveFromBlacklist(
	ctx contractapi.TransactionContextInterface,
	userID string,
) error {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return err
	}

	record.IsBlacklisted = false
	record.BlacklistReason = ""
	record.UpdatedAt = time.Now().Unix()

	// Deactivate blacklist entry
	blacklistKey := fmt.Sprintf("BLACKLIST_%s", userID)
	entryBytes, _ := ctx.GetStub().GetState(blacklistKey)
	if entryBytes != nil {
		var entry BlacklistEntry
		json.Unmarshal(entryBytes, &entry)
		entry.IsActive = false
		updatedBytes, _ := json.Marshal(entry)
		ctx.GetStub().PutState(blacklistKey, updatedBytes)
	}

	return ks.saveKYCRecord(ctx, record)
}

// CheckKYC validates if a user can perform an operation
func (ks *KYCService) CheckKYC(
	ctx contractapi.TransactionContextInterface,
	userID string,
	amount int64,
) (bool, string, error) {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return false, "KYC record not found", err
	}

	// Get usage
	dailyUsed, monthlyUsed, err := ks.getUsage(ctx, userID)
	if err != nil {
		return false, "failed to check limits", err
	}

	// Check if can transact
	canTransact, reason := record.CanTransact(amount, dailyUsed, monthlyUsed)
	if !canTransact {
		return false, reason, nil
	}

	return true, "", nil
}

// RecordTransaction records a transaction for limit tracking
func (ks *KYCService) RecordTransaction(
	ctx contractapi.TransactionContextInterface,
	userID string,
	amount int64,
	txType string,
) error {
	tx := &KYCTransaction{
		TransactionID: ctx.GetStub().GetTxID(),
		UserID:        userID,
		Amount:        amount,
		Timestamp:     time.Now().Unix(),
		TxType:        txType,
	}

	txKey := fmt.Sprintf("KYC_TX_%s_%s", userID, tx.TransactionID)
	txBytes, _ := json.Marshal(tx)
	return ctx.GetStub().PutState(txKey, txBytes)
}

// GetKYCRecord retrieves a KYC record
func (ks *KYCService) GetKYCRecord(
	ctx contractapi.TransactionContextInterface,
	userID string,
) (*KYCRecord, error) {
	kycKey := fmt.Sprintf("KYC_%s", userID)
	recordBytes, err := ctx.GetStub().GetState(kycKey)
	if err != nil {
		return nil, err
	}
	if recordBytes == nil {
		return nil, fmt.Errorf("KYC record not found for user %s", userID)
	}

	var record KYCRecord
	if err := json.Unmarshal(recordBytes, &record); err != nil {
		return nil, err
	}

	return &record, nil
}

// GetKYCStatus returns just the status (for quick checks)
func (ks *KYCService) GetKYCStatus(
	ctx contractapi.TransactionContextInterface,
	userID string,
) (KYCStatus, error) {
	record, err := ks.GetKYCRecord(ctx, userID)
	if err != nil {
		return KYCPending, err
	}
	return record.Status, nil
}

// Private helper methods

func (ks *KYCService) saveKYCRecord(
	ctx contractapi.TransactionContextInterface,
	record *KYCRecord,
) error {
	kycKey := fmt.Sprintf("KYC_%s", record.UserID)
	recordBytes, err := json.Marshal(record)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(kycKey, recordBytes)
}

func (ks *KYCService) getUsage(
	ctx contractapi.TransactionContextInterface,
	userID string,
) (dailyUsed int64, monthlyUsed int64, err error) {
	// Get transactions for the last 24 hours and 30 days
	now := time.Now().Unix()
	dayAgo := now - 86400
	monthAgo := now - 2592000

	// Query transactions (simplified - in production use proper range queries)
	iterator, err := ctx.GetStub().GetStateByRange(
		fmt.Sprintf("KYC_TX_%s_", userID),
		fmt.Sprintf("KYC_TX_%s_~", userID),
	)
	if err != nil {
		return 0, 0, err
	}
	defer iterator.Close()

	dailyUsed = 0
	monthlyUsed = 0

	for iterator.HasNext() {
		result, err := iterator.Next()
		if err != nil {
			continue
		}

		var tx KYCTransaction
		if err := json.Unmarshal(result.Value, &tx); err != nil {
			continue
		}

		if tx.Timestamp >= dayAgo {
			dailyUsed += tx.Amount
		}
		if tx.Timestamp >= monthAgo {
			monthlyUsed += tx.Amount
		}
	}

	return dailyUsed, monthlyUsed, nil
}

// IsBlacklisted checks if an entity is blacklisted
func (ks *KYCService) IsBlacklisted(
	ctx contractapi.TransactionContextInterface,
	entityID string,
) (bool, string, error) {
	blacklistKey := fmt.Sprintf("BLACKLIST_%s", entityID)
	entryBytes, err := ctx.GetStub().GetState(blacklistKey)
	if err != nil {
		return false, "", err
	}
	if entryBytes == nil {
		return false, "", nil
	}

	var entry BlacklistEntry
	if err := json.Unmarshal(entryBytes, &entry); err != nil {
		return false, "", err
	}

	if entry.IsActive {
		return true, entry.Reason, nil
	}

	return false, "", nil
}
