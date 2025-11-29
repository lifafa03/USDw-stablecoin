package telemetry

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sirupsen/logrus"
)

// MetricsCollector handles Prometheus metrics
type MetricsCollector struct {
	MintCount            prometheus.Counter
	BurnCount            prometheus.Counter
	TransferCount        prometheus.Counter
	GovernanceActions    prometheus.Counter
	ZKVerificationFailed prometheus.Counter
	ZKVerificationSuccess prometheus.Counter
	TotalSupply          prometheus.Gauge
	ActiveAccounts       prometheus.Gauge
	FrozenAccounts       prometheus.Gauge
	TransactionLatency   prometheus.Histogram
	GovernanceLatency    prometheus.Histogram
}

// NewMetricsCollector creates a new metrics collector
func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{
		MintCount: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_mint_total",
			Help: "Total number of mint operations",
		}),
		BurnCount: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_burn_total",
			Help: "Total number of burn operations",
		}),
		TransferCount: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_transfer_total",
			Help: "Total number of transfer operations",
		}),
		GovernanceActions: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_governance_actions_total",
			Help: "Total number of governance actions executed",
		}),
		ZKVerificationFailed: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_zk_verification_failed_total",
			Help: "Total number of failed ZK proof verifications",
		}),
		ZKVerificationSuccess: promauto.NewCounter(prometheus.CounterOpts{
			Name: "genusd_zk_verification_success_total",
			Help: "Total number of successful ZK proof verifications",
		}),
		TotalSupply: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "genusd_total_supply",
			Help: "Current total supply of GENUSD",
		}),
		ActiveAccounts: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "genusd_active_accounts",
			Help: "Number of active accounts",
		}),
		FrozenAccounts: promauto.NewGauge(prometheus.GaugeOpts{
			Name: "genusd_frozen_accounts",
			Help: "Number of frozen accounts",
		}),
		TransactionLatency: promauto.NewHistogram(prometheus.HistogramOpts{
			Name:    "genusd_transaction_latency_seconds",
			Help:    "Transaction processing latency in seconds",
			Buckets: prometheus.DefBuckets,
		}),
		GovernanceLatency: promauto.NewHistogram(prometheus.HistogramOpts{
			Name:    "genusd_governance_latency_seconds",
			Help:    "Governance action processing latency in seconds",
			Buckets: prometheus.DefBuckets,
		}),
	}
}

// RecordMint records a mint operation
func (mc *MetricsCollector) RecordMint(amount int64) {
	mc.MintCount.Inc()
	mc.TotalSupply.Add(float64(amount))
}

// RecordBurn records a burn operation
func (mc *MetricsCollector) RecordBurn(amount int64) {
	mc.BurnCount.Inc()
	mc.TotalSupply.Sub(float64(amount))
}

// RecordTransfer records a transfer operation
func (mc *MetricsCollector) RecordTransfer() {
	mc.TransferCount.Inc()
}

// RecordGovernanceAction records a governance action
func (mc *MetricsCollector) RecordGovernanceAction() {
	mc.GovernanceActions.Inc()
}

// RecordZKVerification records a ZK proof verification result
func (mc *MetricsCollector) RecordZKVerification(success bool) {
	if success {
		mc.ZKVerificationSuccess.Inc()
	} else {
		mc.ZKVerificationFailed.Inc()
	}
}

// UpdateTotalSupply updates the total supply gauge
func (mc *MetricsCollector) UpdateTotalSupply(supply int64) {
	mc.TotalSupply.Set(float64(supply))
}

// UpdateAccountMetrics updates account-related metrics
func (mc *MetricsCollector) UpdateAccountMetrics(active, frozen int) {
	mc.ActiveAccounts.Set(float64(active))
	mc.FrozenAccounts.Set(float64(frozen))
}

// RecordTransactionLatency records transaction processing latency
func (mc *MetricsCollector) RecordTransactionLatency(duration time.Duration) {
	mc.TransactionLatency.Observe(duration.Seconds())
}

// RecordGovernanceLatency records governance action latency
func (mc *MetricsCollector) RecordGovernanceLatency(duration time.Duration) {
	mc.GovernanceLatency.Observe(duration.Seconds())
}

// AuditEvent represents an auditable event
type AuditEvent struct {
	EventID         string                 `json:"event_id"`
	EventType       string                 `json:"event_type"`
	Action          string                 `json:"action"`
	Actor           string                 `json:"actor"`
	Target          string                 `json:"target"`
	Timestamp       int64                  `json:"timestamp"`
	TxID            string                 `json:"tx_id"`
	HashCommitment  string                 `json:"hash_commitment"`
	DilithiumSig    string                 `json:"dilithium_signature"`
	Parameters      map[string]interface{} `json:"parameters"`
	Result          string                 `json:"result"`
	ErrorMessage    string                 `json:"error_message,omitempty"`
	BlockNumber     uint64                 `json:"block_number"`
	ChannelID       string                 `json:"channel_id"`
}

// AuditLogger handles structured audit logging
type AuditLogger struct {
	logger *logrus.Logger
	events []AuditEvent
	mu     sync.RWMutex
}

// NewAuditLogger creates a new audit logger
func NewAuditLogger() *AuditLogger {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339Nano,
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyTime:  "timestamp",
			logrus.FieldKeyLevel: "level",
			logrus.FieldKeyMsg:   "message",
		},
	})

	return &AuditLogger{
		logger: logger,
		events: make([]AuditEvent, 0),
	}
}

// LogEvent logs a general audit event
func (al *AuditLogger) LogEvent(event AuditEvent) {
	al.mu.Lock()
	al.events = append(al.events, event)
	al.mu.Unlock()

	al.logger.WithFields(logrus.Fields{
		"event_id":         event.EventID,
		"event_type":       event.EventType,
		"action":           event.Action,
		"actor":            event.Actor,
		"target":           event.Target,
		"tx_id":            event.TxID,
		"hash_commitment":  event.HashCommitment,
		"dilithium_sig":    event.DilithiumSig,
		"parameters":       event.Parameters,
		"result":           event.Result,
		"error_message":    event.ErrorMessage,
		"block_number":     event.BlockNumber,
		"channel_id":       event.ChannelID,
	}).Info("Audit event")
}

// LogTransactionEvent logs a transaction-related event
func (al *AuditLogger) LogTransactionEvent(
	txType string,
	txID string,
	actor string,
	parameters map[string]interface{},
	result string,
) {
	event := AuditEvent{
		EventID:    fmt.Sprintf("%s_%d", txType, time.Now().UnixNano()),
		EventType:  "TRANSACTION",
		Action:     txType,
		Actor:      actor,
		Timestamp:  time.Now().Unix(),
		TxID:       txID,
		Parameters: parameters,
		Result:     result,
	}

	al.LogEvent(event)
}

// LogGovernanceAction logs a governance action
func (al *AuditLogger) LogGovernanceAction(
	action interface{},
	actor string,
	target string,
	parameters map[string]interface{},
) {
	event := AuditEvent{
		EventID:    fmt.Sprintf("GOV_%s_%d", action, time.Now().UnixNano()),
		EventType:  "GOVERNANCE",
		Action:     fmt.Sprintf("%v", action),
		Actor:      actor,
		Target:     target,
		Timestamp:  time.Now().Unix(),
		Parameters: parameters,
		Result:     "pending",
	}

	al.LogEvent(event)
}

// LogKYCEvent logs a KYC-related event
func (al *AuditLogger) LogKYCEvent(
	action string,
	userID string,
	kycLevel string,
	result string,
) {
	event := AuditEvent{
		EventID:   fmt.Sprintf("KYC_%s_%d", action, time.Now().UnixNano()),
		EventType: "KYC",
		Action:    action,
		Actor:     "KYC_SYSTEM",
		Target:    userID,
		Timestamp: time.Now().Unix(),
		Parameters: map[string]interface{}{
			"kyc_level": kycLevel,
		},
		Result: result,
	}

	al.LogEvent(event)
}

// LogZKVerificationEvent logs a ZK proof verification event
func (al *AuditLogger) LogZKVerificationEvent(
	commitment string,
	nullifier string,
	success bool,
	errorMsg string,
) {
	result := "success"
	if !success {
		result = "failed"
	}

	event := AuditEvent{
		EventID:        fmt.Sprintf("ZK_VERIFY_%d", time.Now().UnixNano()),
		EventType:      "ZK_VERIFICATION",
		Action:         "VERIFY_PROOF",
		Timestamp:      time.Now().Unix(),
		HashCommitment: commitment,
		Parameters: map[string]interface{}{
			"nullifier": nullifier,
		},
		Result:       result,
		ErrorMessage: errorMsg,
	}

	al.LogEvent(event)
}

// GetRecentEvents returns recent audit events
func (al *AuditLogger) GetRecentEvents(limit int) []AuditEvent {
	al.mu.RLock()
	defer al.mu.RUnlock()

	start := len(al.events) - limit
	if start < 0 {
		start = 0
	}

	return al.events[start:]
}

// ExportEventsJSON exports events to JSON format
func (al *AuditLogger) ExportEventsJSON() (string, error) {
	al.mu.RLock()
	defer al.mu.RUnlock()

	data, err := json.MarshalIndent(al.events, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal events: %w", err)
	}

	return string(data), nil
}

// LogInfo logs an informational message
func (al *AuditLogger) LogInfo(message string, fields map[string]interface{}) {
	al.logger.WithFields(logrus.Fields(fields)).Info(message)
}

// LogWarning logs a warning message
func (al *AuditLogger) LogWarning(message string, fields map[string]interface{}) {
	al.logger.WithFields(logrus.Fields(fields)).Warn(message)
}

// LogError logs an error message
func (al *AuditLogger) LogError(message string, err error, fields map[string]interface{}) {
	if fields == nil {
		fields = make(map[string]interface{})
	}
	fields["error"] = err.Error()
	al.logger.WithFields(logrus.Fields(fields)).Error(message)
}

// InvariantChecker validates system invariants
type InvariantChecker struct {
	logger *AuditLogger
}

// NewInvariantChecker creates a new invariant checker
func NewInvariantChecker(logger *AuditLogger) *InvariantChecker {
	return &InvariantChecker{
		logger: logger,
	}
}

// CheckNoNegativeBalance validates that no account has negative balance
func (ic *InvariantChecker) CheckNoNegativeBalance(accountID string, balance int64) error {
	if balance < 0 {
		err := fmt.Errorf("INVARIANT VIOLATION: account %s has negative balance: %d", accountID, balance)
		ic.logger.LogError("Invariant violation", err, map[string]interface{}{
			"invariant": "NO_NEGATIVE_BALANCE",
			"account_id": accountID,
			"balance": balance,
		})
		return err
	}
	return nil
}

// CheckNoUnreferencedNullifiers validates that all nullifiers have corresponding commitments
func (ic *InvariantChecker) CheckNoUnreferencedNullifiers(nullifier string, hasCommitment bool) error {
	if !hasCommitment {
		err := fmt.Errorf("INVARIANT VIOLATION: nullifier %s has no corresponding commitment", nullifier)
		ic.logger.LogError("Invariant violation", err, map[string]interface{}{
			"invariant": "NO_UNREFERENCED_NULLIFIERS",
			"nullifier": nullifier,
		})
		return err
	}
	return nil
}

// CheckSupplyConsistency validates that total supply matches sum of all balances
func (ic *InvariantChecker) CheckSupplyConsistency(totalSupply int64, sumOfBalances int64) error {
	if totalSupply != sumOfBalances {
		err := fmt.Errorf("INVARIANT VIOLATION: total supply mismatch - reported: %d, actual: %d",
			totalSupply, sumOfBalances)
		ic.logger.LogError("Invariant violation", err, map[string]interface{}{
			"invariant":       "SUPPLY_CONSISTENCY",
			"total_supply":    totalSupply,
			"sum_of_balances": sumOfBalances,
		})
		return err
	}
	return nil
}

// CheckGovernanceSignature validates that governance action has required Dilithium signature
func (ic *InvariantChecker) CheckGovernanceSignature(action string, hasDilithiumSig bool) error {
	if !hasDilithiumSig {
		err := fmt.Errorf("INVARIANT VIOLATION: governance action %s missing Dilithium signature", action)
		ic.logger.LogError("Invariant violation", err, map[string]interface{}{
			"invariant": "GOVERNANCE_REQUIRES_PQ_SIGNATURE",
			"action":    action,
		})
		return err
	}
	return nil
}

// CheckPolicyCompliance validates that state mutation complies with policy
func (ic *InvariantChecker) CheckPolicyCompliance(action string, policyAllows bool) error {
	if !policyAllows {
		err := fmt.Errorf("INVARIANT VIOLATION: action %s violates current policy", action)
		ic.logger.LogError("Invariant violation", err, map[string]interface{}{
			"invariant": "POLICY_COMPLIANCE_ON_STATE_MUTATION",
			"action":    action,
		})
		return err
	}
	return nil
}
