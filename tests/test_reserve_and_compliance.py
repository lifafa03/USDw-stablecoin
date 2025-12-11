import json
from pathlib import Path

from simulation.full_flow_demo import MockReserveRegistry, KYCRegistry, RiskEngine


def test_reserve_auto_issues_when_capacity_insufficient():
    registry = MockReserveRegistry()
    starting_lots = len(registry.holdings)
    allocations = registry.allocate(2_000_000_000)
    assert allocations, "Allocation should succeed even when exceeding initial capacity"
    assert len(registry.holdings) > starting_lots, "New Treasury lot should auto-issue"
    assert any(a['reserve_id'].startswith('UST-AUTO') for a in registry.allocations), "Auto-issued lot should be recorded"


def test_kyc_registry_persists_records(tmp_path):
    kyc_path = tmp_path / "kyc_registry.json"
    initial_records = {
        'test_user': {
            'status': 'approved',
            'tier': 'FULL',
            'verified_on': '2025-01-01T00:00:00Z'
        }
    }
    registry = KYCRegistry(kyc_path, initial_records=initial_records)
    assert registry.is_verified('test_user')
    registry.records['test_user']['status'] = 'pending'
    registry.save()

    registry_reloaded = KYCRegistry(kyc_path)
    assert not registry_reloaded.is_verified('test_user'), "Persisted status should reload correctly"
    assert registry_reloaded.describe('test_user').startswith('status=pending')


def test_risk_engine_limits_by_tier(tmp_path):
    path = tmp_path / "kyc_data.json"
    records = {
        'full_user': {'status': 'approved', 'tier': 'FULL', 'verified_on': None},
        'limited_user': {'status': 'approved', 'tier': 'LIMITED', 'verified_on': None}
    }
    registry = KYCRegistry(path, initial_records=records)
    engine = RiskEngine(registry)

    assert engine.check_limit('full_user', 5_000, 'remittance')
    assert not engine.check_limit('limited_user', 2_000, 'remittance')
