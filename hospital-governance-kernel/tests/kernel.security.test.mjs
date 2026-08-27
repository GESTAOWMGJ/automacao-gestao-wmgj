import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function signedBytes(buffer) {
  return Array.from(buffer, value => value > 127 ? value - 256 : value);
}

function loadKernel() {
  const properties = new Map();
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    String,
    Boolean,
    RegExp,
    Error,
    parseInt,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(_algorithm, value) {
        return signedBytes(crypto.createHash('sha256').update(String(value), 'utf8').digest());
      },
      computeHmacSha256Signature(value, secret) {
        return signedBytes(crypto.createHmac('sha256', String(secret)).update(String(value), 'utf8').digest());
      },
      getUuid() { return crypto.randomUUID(); }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.has(key) ? properties.get(key) : null; },
          setProperty(key, value) { properties.set(key, String(value)); },
          setProperties(values) {
            Object.entries(values).forEach(([key, value]) => properties.set(key, String(value)));
          }
        };
      }
    }
  });
  for (const file of fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(root, 'src', file), 'utf8'), { filename: file }).runInContext(context);
  }
  return context;
}

function syntheticInput(overrides = {}) {
  return {
    orgId: 'wmgj-sandbox',
    facilityId: 'sandbox-facility',
    eventType: 'GOVERNANCE_CASE_UPSERT',
    aggregateType: 'governanceCase',
    aggregateId: 'case-001',
    expectedVersion: 7,
    sourceSystem: 'SYNTHETIC',
    sourceId: 'case-001',
    sourceVersion: '1',
    sensitivity: 'INTERNAL',
    evidenceRefs: ['synthetic://evidence/001'],
    payload: { workflowState: 'RECEIVED', reviewState: 'PENDING', riskLevel: 'HIGH', synthetic: true },
    ...overrides
  };
}

function buildEvent(k, overrides = {}) {
  return k.hkgkBuildEnvelope_(syntheticInput(overrides), {
    now: '2026-08-26T20:00:00.000Z',
    eventId: 'event-1',
    traceId: 'trace-1',
    orgId: 'wmgj-sandbox'
  });
}

test('dispatch integrity binds actor and idempotency key to the content hash', () => {
  const k = loadKernel();
  const event = buildEvent(k);
  const originalHash = event.contentHash;
  event.actor.id = 'forged-user';
  event.idempotencyKey = 'f'.repeat(64);
  assert.notEqual(k.hkgkContentHash_(event), originalHash);
  const validation = k.hkgkValidateEventEnvelope_(event);
  assert.equal(validation.ok, false);
  assert.ok(Array.from(validation.errors).includes('idempotencyKey:MISMATCH'));
  assert.ok(Array.from(validation.errors).includes('contentHash:MISMATCH'));
});

test('mapper carries expectedVersion and converts invalid risk to critical pending review', () => {
  const k = loadKernel();
  const event = buildEvent(k, {
    payload: { workflowState: 'RECEIVED', reviewState: 'APPROVED', riskLevel: 'URGENT', synthetic: true }
  });
  const mapped = k.hkgkToFirestoreEvent_(event);
  assert.equal(mapped.expectedVersion, 7);
  assert.equal(mapped.riskLevel, 'CRITICAL');
  assert.equal(mapped.reviewState, 'PENDING');
  assert.equal(k.hkgkExpectedVersionFromInbox_('3', 'trace-1'), 3);
  assert.equal(k.hkgkExpectedVersionFromInbox_('', 'trace-1'), 0);
  assert.throws(() => k.hkgkExpectedVersionFromInbox_('3.5', 'trace-1'), /INBOX_EXPECTED_VERSION_INVALID/);
});

test('closure rejects missing snapshot/version and accepts only backend-authenticated approval', () => {
  const k = loadKernel();
  const incomplete = k.hkgkAssessTransition_(
    { toState: 'CLOSED', expectedVersion: null, reasonCode: 'CLOSE' },
    {
      workflowState: 'VALIDATED', version: 0, evidenceRefs: ['source://evidence/001'],
      riskLevel: 'LOW', requestedBy: 'requester', reconciliationStatus: 'MATCHED'
    },
    [],
    [{ status: 'APPROVED', approverId: 'someone' }]
  );
  assert.equal(incomplete.ok, false);
  assert.ok(Array.from(incomplete.reasons).includes('EXPECTED_VERSION_REQUIRED'));
  assert.ok(Array.from(incomplete.reasons).includes('SNAPSHOT_HASH_REQUIRED'));

  const snapshot = {
    workflowState: 'VALIDATED', version: 3, snapshotHash: 'snapshot-1', orgId: 'wmgj-sandbox',
    evidenceRefs: ['source://evidence/001'], riskLevel: 'LOW', requestedBy: 'requester',
    reconciliationStatus: 'MATCHED'
  };
  const approval = {
    status: 'APPROVED', snapshotHash: 'snapshot-1', approverId: 'auditor-2', orgId: 'wmgj-sandbox',
    identityVerified: true, source: 'BACKEND_AUTH', actorType: 'USER', action: 'CLOSE_CASE',
    roles: ['auditor'], expiresAt: '2099-01-01T00:00:00.000Z'
  };
  const accepted = k.hkgkAssessTransition_(
    { toState: 'CLOSED', expectedVersion: 3, reasonCode: 'CLOSE', snapshotHash: 'snapshot-1' },
    snapshot,
    [],
    [approval]
  );
  assert.equal(accepted.ok, true);
});

test('clinical approval requires authenticated medical auditor role', () => {
  const k = loadKernel();
  const snapshot = {
    snapshotHash: 'snapshot-clinical', orgId: 'wmgj-sandbox', evidenceRefs: ['source://evidence/001'],
    riskLevel: 'LOW', clinical: true, requestedBy: 'requester', reconciliationStatus: 'MATCHED'
  };
  const base = {
    status: 'APPROVED', snapshotHash: 'snapshot-clinical', approverId: 'reviewer', orgId: 'wmgj-sandbox',
    identityVerified: true, source: 'BACKEND_AUTH', actorType: 'USER', action: 'VALIDATE_CASE',
    expiresAt: '2099-01-01T00:00:00.000Z'
  };
  assert.equal(k.hkgkClosureGate_(snapshot, [], [{ ...base, roles: ['auditor'] }], false).ok, false);
  assert.equal(k.hkgkClosureGate_(snapshot, [], [{ ...base, roles: ['medical_auditor'] }], false).ok, true);
});

test('PII and unsafe evidence/source identifiers are rejected outside payload too', () => {
  const k = loadKernel();
  assert.throws(() => buildEvent(k, { sourceId: '000.000.000-00' }), /EVENT_CONTRACT_INVALID/);
  assert.throws(
    () => buildEvent(k, { evidenceRefs: ['drive://evidence/001?token=secret'] }),
    /EVENT_CONTRACT_INVALID/
  );
  assert.throws(
    () => buildEvent(k, { payload: { patientName: 'Pessoa', synthetic: true } }),
    /DIRECT_IDENTIFIER_FORBIDDEN/
  );
});

test('outbox and repository reject values above the safe Sheets cell limit', () => {
  const k = loadKernel();
  assert.throws(() => k.hkgkSerializeCellValue_('x'.repeat(45001), 'EVENT_JSON'), /CELL_VALUE_TOO_LARGE/);
  assert.throws(
    () => buildEvent(k, { payload: { narrative: 'x'.repeat(45001), synthetic: true } }),
    /EVENT_CONTRACT_INVALID/
  );
});

test('retryability override and safe dispatch batch fail closed', () => {
  const k = loadKernel();
  assert.equal(k.hkgkRetryDecision_('UNKNOWN', 1, 5, 1, true).action, 'RETRY_WAIT');
  assert.equal(k.hkgkRetryDecision_('NETWORK', 1, 5, 1, false).action, 'DEAD_LETTER');
  assert.equal(k.hkgkSafeDispatchBatch_({
    maxBatch: 20, maxDispatchBatch: 5, leaseSeconds: 120, apiTimeoutMs: 20000
  }), 4);
  assert.equal(k.hkgkBackendConflictCode_(409, { code: 'VERSION_CONFLICT' }), 'VERSION_CONFLICT');
  assert.equal(
    k.hkgkBackendConflictCode_(409, { code: 'LEGACY_RECEIPT_INCOMPLETE' }),
    'LEGACY_RECEIPT_INCOMPLETE'
  );
  assert.equal(k.hkgkBackendConflictCode_(409, { code: 'UNTRUSTED_CODE' }), '');
});

test('dry-run validation creates no receipt and becomes claimable only after transport approval', () => {
  const k = loadKernel();
  const future = new Date(Date.now() + 60000).toISOString();
  const row = {
    __rowNumber: 2, JOB_ID: 'job-1', STATUS: 'LEASED', LEASE_TOKEN: 'lease-1',
    LEASE_EXPIRES_AT: future, IDEMPOTENCY_KEY: 'a'.repeat(64), CONTENT_HASH: 'b'.repeat(64)
  };
  const updates = [];
  k.hkgkWithScriptLock_ = (_timeout, callback) => callback();
  k.hkgkReadObjects_ = () => [row];
  k.hkgkUpdateRow_ = (_sheet, _row, changes) => updates.push(changes);
  assert.equal(k.hkgkMarkDryRunValidated_({ ...row, TRACE_ID: 'trace-1' }), 'DRY_RUN_VALIDATED');
  assert.equal(updates[0].STATUS, 'DRY_RUN_VALIDATED');
  assert.equal(updates[0].RECEIPT_JSON, '');

  const dryRow = { ...row, STATUS: 'DRY_RUN_VALIDATED', LEASE_TOKEN: '', LEASE_EXPIRES_AT: '' };
  k.hkgkReadObjects_ = () => [dryRow];
  updates.length = 0;
  assert.equal(k.hkgkClaimJobs_(1, 120, { dryRun: true, transportApproved: false }).length, 0);
  assert.equal(k.hkgkClaimJobs_(1, 120, { dryRun: false, transportApproved: true }).length, 1);
});

test('backend receipt is strict, hash-bound and never synthesized locally', () => {
  const k = loadKernel();
  const job = { CONTENT_HASH: 'a'.repeat(64), TRACE_ID: 'trace-1' };
  const valid = {
    ok: true,
    accepted: true,
    duplicate: false,
    contentHash: job.CONTENT_HASH,
    semanticHash: 'b'.repeat(64),
    receiptId: 'c'.repeat(64),
    entityId: 'entity-1',
    eventId: 'event-1',
    auditEventId: 'audit-1',
    aggregateVersion: 1
  };
  assert.equal(k.hkgkValidateBackendReceipt_(valid, job), true);
  assert.throws(
    () => k.hkgkValidateBackendReceipt_({ ...valid, duplicate: true }, job),
    /BACKEND_RECEIPT_INVALID/
  );
  assert.throws(
    () => k.hkgkValidateBackendReceipt_({ ...valid, contentHash: 'd'.repeat(64) }, job),
    /BACKEND_RECEIPT_INVALID/
  );
  assert.throws(
    () => k.hkgkValidateBackendReceipt_({ ...valid, semanticHash: '', auditEventId: '' }, job),
    /BACKEND_RECEIPT_INVALID/
  );
});

test('kill switch distinguishes ALL from DISPATCH and spreadsheet marker fails closed', () => {
  const k = loadKernel();
  const config = {
    env: 'staging', orgId: 'wmgj-sandbox', dryRun: true, pauseMode: 'ALL', killSwitch: true,
    transportApproved: false, clinicalMode: 'disabled', dataSpreadsheetId: '', dataSpreadsheetMarker: '',
    ingestUrl: '', ingestKeyId: '', ingestSecret: '', maxBatch: 20, maxDispatchBatch: 5,
    leaseSeconds: 120, maxAttempts: 5, apiTimeoutMs: 20000, dashboardStaleSeconds: 180
  };
  assert.throws(() => k.hkgkAssertRunnable_(config, 'SCAN'), /KILL_SWITCH_ALL_ACTIVE/);
  assert.doesNotThrow(() => k.hkgkAssertRunnable_(config, 'READ'));
  assert.throws(
    () => k.hkgkVerifySpreadsheetMarker_({ getId: () => 'sheet-id', getSheetByName: () => null }, 'marker'),
    /SPREADSHEET_MARKER_NOT_FOUND/
  );
});

test('unknown risk is critical and always requires human review', () => {
  const k = loadKernel();
  const result = k.hkgkEvaluateRulesPure_({ evidenceRefs: ['source://evidence/001'], riskLevel: 'URGENT' });
  assert.equal(result.overallRisk, 'CRITICAL');
  assert.equal(result.requiresHumanReview, true);
  assert.ok(Array.from(result.findings.map(item => item.code)).includes('RISK_LEVEL_INVALID'));
});
