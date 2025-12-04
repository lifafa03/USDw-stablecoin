package kyc

import (
	"time"
)

// KYCStatus represents the verification status of a user
type KYCStatus string

const (
	KYCPending  KYCStatus = "pending"
	KYCApproved KYCStatus = "approved"
	KYCRejected KYCStatus = "rejected"
	KYCSuspended KYCStatus = "suspended"
	KYCExpired  KYCStatus = "expired"
)

// KYCTier represents different levels of verification
type KYCTier int

const (
	KYCTierNone   KYCTier = 0 // Not verified
	KYCTierBasic  KYCTier = 1 // Basic verification (up to $1000/day)
	KYCTierStandard KYCTier = 2 // Standard verification (up to $10,000/day)
	KYCTierPremium KYCTier = 3 // Premium verification (unlimited)
)

// KYCRecord represents a user's KYC information
type KYCRecord struct {
	UserID           string                 `json:"userID"`
	Status           KYCStatus              `json:"status"`
	Tier             KYCTier                `json:"tier"`
	CreatedAt        int64                  `json:"createdAt"`
	UpdatedAt        int64                  `json:"updatedAt"`
	ApprovedAt       int64                  `json:"approvedAt,omitempty"`
	ExpiresAt        int64                  `json:"expiresAt,omitempty"`
	ReviewedBy       string                 `json:"reviewedBy,omitempty"`
	
	// Personal Information
	FullName         string                 `json:"fullName"`
	DateOfBirth      string                 `json:"dateOfBirth,omitempty"`
	Nationality      string                 `json:"nationality,omitempty"`
	
	// Address
	AddressLine1     string                 `json:"addressLine1,omitempty"`
	AddressLine2     string                 `json:"addressLine2,omitempty"`
	City             string                 `json:"city,omitempty"`
	State            string                 `json:"state,omitempty"`
	PostalCode       string                 `json:"postalCode,omitempty"`
	Country          string                 `json:"country"`
	
	// Identity Documents
	DocumentType     string                 `json:"documentType,omitempty"` // passport, drivers_license, national_id
	DocumentNumber   string                 `json:"documentNumber,omitempty"`
	DocumentExpiry   string                 `json:"documentExpiry,omitempty"`
	
	// Compliance
	IsBlacklisted    bool                   `json:"isBlacklisted"`
	BlacklistReason  string                 `json:"blacklistReason,omitempty"`
	RiskScore        int                    `json:"riskScore"` // 0-100, higher = riskier
	
	// Limits
	DailyLimit       int64                  `json:"dailyLimit"` // In cents
	MonthlyLimit     int64                  `json:"monthlyLimit"`
	
	// Metadata
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	Notes            string                 `json:"notes,omitempty"`
}

// KYCTransaction represents a transaction for limit tracking
type KYCTransaction struct {
	TransactionID string  `json:"transactionID"`
	UserID        string  `json:"userID"`
	Amount        int64   `json:"amount"`
	Timestamp     int64   `json:"timestamp"`
	TxType        string  `json:"txType"` // mint, transfer, burn
}

// BlacklistEntry represents a blacklisted entity
type BlacklistEntry struct {
	EntityID      string    `json:"entityID"` // User ID or address
	EntityType    string    `json:"entityType"` // user, address, country
	Reason        string    `json:"reason"`
	AddedAt       int64     `json:"addedAt"`
	AddedBy       string    `json:"addedBy"`
	ExpiresAt     int64     `json:"expiresAt,omitempty"` // 0 = permanent
	IsActive      bool      `json:"isActive"`
}

// GetDailyLimit returns the daily transaction limit based on KYC tier
func (tier KYCTier) GetDailyLimit() int64 {
	switch tier {
	case KYCTierBasic:
		return 100000 // $1,000 (in cents)
	case KYCTierStandard:
		return 1000000 // $10,000
	case KYCTierPremium:
		return 0 // Unlimited (0 = no limit)
	default:
		return 0 // No KYC = no transactions
	}
}

// GetMonthlyLimit returns the monthly transaction limit based on KYC tier
func (tier KYCTier) GetMonthlyLimit() int64 {
	switch tier {
	case KYCTierBasic:
		return 500000 // $5,000
	case KYCTierStandard:
		return 5000000 // $50,000
	case KYCTierPremium:
		return 0 // Unlimited
	default:
		return 0
	}
}

// IsExpired checks if a KYC record has expired
func (kyc *KYCRecord) IsExpired() bool {
	if kyc.ExpiresAt == 0 {
		return false // No expiration
	}
	return time.Now().Unix() > kyc.ExpiresAt
}

// IsValid checks if a KYC record is valid for transactions
func (kyc *KYCRecord) IsValid() bool {
	if kyc.IsBlacklisted {
		return false
	}
	if kyc.Status != KYCApproved {
		return false
	}
	if kyc.IsExpired() {
		return false
	}
	return true
}

// CanTransact checks if a user can perform a transaction of given amount
func (kyc *KYCRecord) CanTransact(amount int64, dailyUsed int64, monthlyUsed int64) (bool, string) {
	if !kyc.IsValid() {
		return false, "KYC not valid"
	}
	
	dailyLimit := kyc.Tier.GetDailyLimit()
	monthlyLimit := kyc.Tier.GetMonthlyLimit()
	
	// Check daily limit (0 = unlimited)
	if dailyLimit > 0 && (dailyUsed+amount) > dailyLimit {
		return false, "daily limit exceeded"
	}
	
	// Check monthly limit
	if monthlyLimit > 0 && (monthlyUsed+amount) > monthlyLimit {
		return false, "monthly limit exceeded"
	}
	
	return true, ""
}
