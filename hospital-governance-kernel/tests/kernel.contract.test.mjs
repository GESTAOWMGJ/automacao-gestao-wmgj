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
    setTimeout,
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
          setProperties(values) { Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))); }
        };
      }
    }
  });
  const files = fs.readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.gs')).sort();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    new vm.Script(source, { filename: file }).runInContext(context);
  }
  return context;
}

const k = loadKernel();

function syntheticInput(overrides = {}) {
  return {
    orgId: 'wmgj-sandbox',
    facilityId: 'sandbox-facility',
    eventType: 'GOVERNANCE_CASE_UPSERT',
    aggregateType: 'governanceCase',
    aggregateId: 'case-001',
    sourceSystem: 'SYNTHETIC',
    sourceId: 'case-001',
    sourceVersion: '1',
    sensitivity: 'INTERNAL',
    evidenceRefs: ['synthetic://evidence/001'],
    payload: { workflowState: 'RECEIVED', reviewState: 'PENDING', riskLevel: 'HIGH', synthetic: true },
    ...overrides
  };
}

test('JSON canônico e hash não dependem da ordem das chaves', () => {
  assert.equal(k.hkgkCanonicalize_({ b: 2, a: 1 }), k.hkgkCanonicalize_({ a: 1, b: 2 }));
  assert.equal(k.hkgkSha256Hex_('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('redescoberta da mesma versão mantém chave e content hash', () => {
  const first = k.hkgkBuildEnvelope_(syntheticInput(), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
  });
  const replay = k.hkgkBuildEnvelope_(syntheticInput(), {
    now: '2026-08-26T20:05:00.000Z', eventId: 'event-2', traceId: 'trace-2', orgId: 'wmgj-sandbox'
  });
  assert.equal(first.idempotencyKey, replay.idempotencyKey);
  assert.equal(first.contentHash, replay.contentHash);
});

test('contrato e builder rejeitam identificador direto sem sanitização silenciosa', () => {
  assert.throws(
    () => k.hkgkBuildEnvelope_(syntheticInput({ payload: { patient_name: 'Pessoa', synthetic: true } }), {
      now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
    }),
    /DIRECT_IDENTIFIER_FORBIDDEN/
  );
  const event = k.hkgkBuildEnvelope_(syntheticInput(), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-2', traceId: 'trace-2', orgId: 'wmgj-sandbox'
  });
  event.payload.cpf = '00000000000';
  assert.equal(k.hkgkValidateEventEnvelope_(event).ok, false);
  assert.throws(
    () => k.hkgkBuildEnvelope_(syntheticInput({ payload: { reference: '000.000.000-00' } }), {
      now: '2026-08-26T20:00:00.000Z', eventId: 'event-3', traceId: 'trace-3', orgId: 'wmgj-sandbox'
    }),
    /DIRECT_IDENTIFIER_FORBIDDEN/
  );
  assert.throws(
    () => k.hkgkBuildEnvelope_(syntheticInput({ payload: { apiKey: 'test-secret' } }), {
      now: '2026-08-26T20:00:00.000Z', eventId: 'event-4', traceId: 'trace-4', orgId: 'wmgj-sandbox'
    }),
    /SECRET_FIELD_FORBIDDEN/
  );
  const authorizationEvent = k.hkgkBuildEnvelope_(syntheticInput({
    payload: { authorizationRef: 'synthetic://authorization/001', synthetic: true }
  }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-5', traceId: 'trace-5', orgId: 'wmgj-sandbox'
  });
  assert.equal(authorizationEvent.payload.authorizationRef, 'synthetic://authorization/001');
});

test('máquina de estados nega atalhos e CLOSED sem gates', () => {
  assert.equal(k.hkgkCanTransition_('RECEIVED', 'CLOSED'), false);
  assert.equal(k.hkgkCanTransition_('VALIDATED', 'CLOSED'), true);
  const snapshot = {
    workflowState: 'VALIDATED', version: 3, snapshotHash: 'hash-1', evidenceRefs: [],
    riskLevel: 'HIGH', requestedBy: 'requester', reconciliationStatus: 'PENDING'
  };
  const result = k.hkgkAssessTransition_(
    { toState: 'CLOSED', expectedVersion: 3, reasonCode: 'CLOSE', snapshotHash: 'hash-1' }, snapshot, [], []
  );
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('EVIDENCE_REQUIRED'));
  assert.ok(result.reasons.includes('APPROVAL_QUORUM_NOT_MET'));
  assert.ok(result.reasons.includes('RECONCILIATION_REQUIRED'));
});

test('segregação de funções invalida autoaprovação', () => {
  const snapshot = {
    snapshotHash: 'hash-1', evidenceRefs: ['ev-1'], riskLevel: 'HIGH', requestedBy: 'same-user',
    reconciliationStatus: 'MATCHED'
  };
  const gate = k.hkgkClosureGate_(snapshot, [], [
    { status: 'APPROVED', snapshotHash: 'hash-1', approverId: 'same-user' }
  ], true);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('SEPARATION_OF_DUTIES_VIOLATION'));
});

test('achado crítico usa riskLevel e bloqueia fechamento', () => {
  const snapshot = {
    snapshotHash: 'hash-1', evidenceRefs: ['ev-1'], riskLevel: 'LOW', requestedBy: 'requester',
    reconciliationStatus: 'MATCHED'
  };
  const gate = k.hkgkClosureGate_(snapshot, [
    { status: 'OPEN', riskLevel: 'CRITICAL' }
  ], [{ status: 'APPROVED', snapshotHash: 'hash-1', approverId: 'approver-1' }], true);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes('CRITICAL_FINDING_OPEN'));
});

test('retry é limitado e 4xx não vira loop', () => {
  assert.equal(k.hkgkRetryDecision_('HTTP_503', 1, 5, 100).action, 'RETRY_WAIT');
  assert.equal(k.hkgkRetryDecision_('HTTP_400', 1, 5, 100).action, 'DEAD_LETTER');
  assert.equal(k.hkgkRetryDecision_('HTTP_503', 5, 5, 100).action, 'DEAD_LETTER');
});

test('modo clínico é default-deny em staging', () => {
  const event = k.hkgkBuildEnvelope_(syntheticInput({ sensitivity: 'CLINICAL_SENSITIVE', clinical: true }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
  });
  const result = k.hkgkClinicalSafety_(event, { env: 'staging', clinicalMode: 'disabled' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('CLINICAL_MODE_DISABLED'));
});

test('motor determinístico detecta autorização, valor, OPME e conciliação', () => {
  const result = k.hkgkEvaluateRulesPure_({
    evidenceRefs: ['ev-1'], competence: '08/2026', requiresAuthorization: true,
    billedAmount: 1200, authorizedAmount: 1000, opme: true, reconciliationStatus: 'PENDING'
  });
  const codes = result.findings.map(item => item.code);
  for (const code of ['COMPETENCE_FORMAT', 'AUTHORIZATION_REQUIRED', 'BILLED_AMOUNT_LIMIT', 'OPME_EVIDENCE_SET', 'RECONCILIATION_MATCH']) {
    assert.ok(codes.includes(code));
  }
  assert.equal(result.overallRisk, 'CRITICAL');
  assert.equal(result.requiresHumanReview, true);
});

test('replay offline dos casos dourados preserva códigos e risco', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/golden-rule-cases.json'), 'utf8'));
  for (const fixture of cases) {
    const result = k.hkgkEvaluateRulesPure_(fixture.input);
    assert.deepEqual(
      Array.from(result.findings.map(item => item.code)).sort(),
      Array.from(fixture.expectedFindingCodes).sort(),
      fixture.id
    );
    assert.equal(result.overallRisk, fixture.expectedRisk, fixture.id);
  }
});

test('algoritmo não promove sem eval, humano, canário e rollback', () => {
  const denied = k.hkgkAlgorithmPromotionGate_({ status: 'ACTIVE', version: '2.0.0', artifactHash: 'x' });
  assert.equal(denied.ok, false);
  assert.ok(denied.reasons.includes('EVAL_REPORT_REQUIRED'));
  assert.ok(denied.reasons.includes('CANARY_MUST_PASS'));
  const allowed = k.hkgkAlgorithmPromotionGate_({
    status: 'ACTIVE', version: '2.0.0', artifactHash: 'a', evalReportHash: 'e',
    humanApprovalId: 'approval-1', rollbackVersion: '1.0.0', canaryStatus: 'PASSED', clinical: false
  });
  assert.equal(allowed.ok, true);
});

test('gateway preserva contrato do PR #13 e mapeia fixture sintética', () => {
  const event = k.hkgkBuildEnvelope_(syntheticInput(), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
  });
  const mapped = k.hkgkToFirestoreEvent_(event);
  assert.equal(mapped.eventType, 'ENTITY_UPSERT');
  assert.equal(mapped.source.system, 'MANUAL');
  assert.equal(mapped.metadata.evidenceRefs[0], 'synthetic://evidence/001');
});

test('gateway preserva estados expandidos e rejeita estado fora do PR #13', () => {
  const event = k.hkgkBuildEnvelope_(syntheticInput({ payload: { workflowState: 'CANCELLED', reviewState: 'EXPIRED' } }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
  });
  const mapped = k.hkgkToFirestoreEvent_(event);
  assert.equal(mapped.workflowState, 'CANCELLED');
  assert.equal(mapped.reviewState, 'EXPIRED');
  const changesRequested = k.hkgkBuildEnvelope_(syntheticInput({
    payload: { workflowState: 'BLOCKED', reviewState: 'CHANGES_REQUESTED' }
  }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-2', traceId: 'trace-2', orgId: 'wmgj-sandbox'
  });
  assert.equal(k.hkgkToFirestoreEvent_(changesRequested).reviewState, 'CHANGES_REQUESTED');
  const unsupported = k.hkgkBuildEnvelope_(syntheticInput({
    payload: { workflowState: 'ARCHIVED', reviewState: 'PENDING' }
  }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-3', traceId: 'trace-3', orgId: 'wmgj-sandbox'
  });
  assert.throws(() => k.hkgkToFirestoreEvent_(unsupported), /BACKEND_WORKFLOW_STATE_UNSUPPORTED/);
});

test('dashboard mantém último estado e prioriza risco', () => {
  const event = k.hkgkBuildEnvelope_(syntheticInput({ payload: { riskLevel: 'CRITICAL' } }), {
    now: '2026-08-26T20:00:00.000Z', eventId: 'event-1', traceId: 'trace-1', orgId: 'wmgj-sandbox'
  });
  const runs = ['SCAN_INBOX', 'DISPATCH_OUTBOX', 'WATCHDOG'].map(runType => ({
    RUN_TYPE: runType, STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z'
  }));
  const summary = k.hkgkDashboardSummaryPure_([
    { JOB_ID: 'j1', STATUS: 'READY', EVENT_JSON: JSON.stringify(event), UPDATED_AT: '2026-08-26T20:00:00.000Z' }
  ], [], runs, [], new Date('2026-08-26T20:01:00.000Z'), 180);
  assert.equal(summary.sourceStatus, 'LIVE');
  assert.equal(summary.healthStatus, 'HEALTHY');
  assert.equal(summary.totals.pending, 1);
  assert.equal(summary.alertQueue[0].riskLevel, 'CRITICAL');
});

test('dashboard filtra antes do limite e declara truncamento da origem', () => {
  const runs = ['SCAN_INBOX', 'DISPATCH_OUTBOX', 'WATCHDOG'].map(runType => ({
    RUN_TYPE: runType, STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z'
  }));
  const outbox = Array.from({ length: 51 }, (_, index) => ({
    JOB_ID: `critical-${index}`,
    STATUS: 'READY',
    EVENT_JSON: JSON.stringify({ aggregate: { type: 'case' }, payload: { riskLevel: 'CRITICAL' } }),
    UPDATED_AT: `2026-08-26T19:${String(index).padStart(2, '0')}:00.000Z`
  }));
  outbox.push({
    JOB_ID: 'low-after-top-fifty',
    STATUS: 'READY',
    EVENT_JSON: JSON.stringify({ aggregate: { type: 'case' }, payload: { riskLevel: 'LOW' } }),
    UPDATED_AT: '2026-08-26T19:59:00.000Z'
  });
  const summary = k.hkgkDashboardSummaryPure_(
    outbox,
    [],
    runs,
    [],
    new Date('2026-08-26T20:01:00.000Z'),
    180,
    { risk: 'LOW' },
    {
      outbox: { rowsRead: 52, availableRows: 12000, isTruncated: true },
      deadLetters: { rowsRead: 0, availableRows: 0, isTruncated: false },
      runs: { rowsRead: 3, availableRows: 3, isTruncated: false },
      receipts: { rowsRead: 0, availableRows: 0, isTruncated: false }
    }
  );
  assert.equal(summary.alertQueue.length, 1);
  assert.equal(summary.alertQueue[0].id, 'low-after-top-fifty');
  assert.equal(summary.queueMeta.totalMatches, 1);
  assert.equal(summary.queueMeta.sourceTruncated, true);
  assert.equal(summary.metricDisplays.pending, '≥52');
  assert.equal(k.hkgkDashboardMetricDisplay_(0, true), 'INDISP.');
  assert.match(summary.windowLabel, /Outbox: 52\/12000 \(parcial\)/);
});

test('dashboard não inventa risco e separa frescor de saúde', () => {
  const runs = [
    { RUN_TYPE: 'SCAN_INBOX', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T19:59:00.000Z' },
    { RUN_TYPE: 'SCAN_INBOX', STATUS: 'FAILED', FINISHED_AT: '2026-08-26T20:00:00.000Z' },
    { RUN_TYPE: 'DISPATCH_OUTBOX', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z' },
    { RUN_TYPE: 'WATCHDOG', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z' }
  ];
  const summary = k.hkgkDashboardSummaryPure_([
    { JOB_ID: 'bad-json', STATUS: 'READY', EVENT_JSON: '{bad', UPDATED_AT: '2026-08-26T20:00:00.000Z' }
  ], [{ CREATED_AT: '2020-01-01T00:00:00.000Z' }], runs, [], new Date('2026-08-26T20:01:00.000Z'), 180);
  assert.equal(summary.freshnessStatus, 'LIVE');
  assert.equal(summary.healthStatus, 'ERROR');
  assert.equal(summary.riskCounts.UNKNOWN, 1);
  assert.equal(summary.riskCounts.MEDIUM, 0);
  assert.equal(summary.alertQueue[0].riskLevel, 'UNKNOWN');
  assert.equal(summary.alertQueue[0].errorCode, 'EVENT_JSON_INVALID');
  assert.equal(summary.invalidData.eventJson, 1);
});

test('dashboard rejeita timestamp futuro e não deixa watchdog mascarar componente stale', () => {
  const summary = k.hkgkDashboardSummaryPure_([], [], [
    { RUN_TYPE: 'SCAN_INBOX', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T19:00:00.000Z' },
    { RUN_TYPE: 'SCAN_INBOX', STATUS: 'FAILED', FINISHED_AT: '2027-08-26T20:00:00.000Z' },
    { RUN_TYPE: 'DISPATCH_OUTBOX', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z' },
    { RUN_TYPE: 'WATCHDOG', STATUS: 'SUCCEEDED', FINISHED_AT: '2026-08-26T20:00:00.000Z' }
  ], [], new Date('2026-08-26T20:01:00.000Z'), 180);
  const scan = summary.componentStatuses.find(component => component.id === 'SCAN_INBOX');
  assert.equal(summary.freshnessStatus, 'STALE');
  assert.equal(summary.healthStatus, 'DEGRADED');
  assert.equal(scan.freshness, 'STALE');
  assert.equal(scan.health, 'HEALTHY');
  assert.equal(summary.invalidData.timestamps, 1);
});

test('schemas e manifesto usam default-deny e mínimo privilégio', () => {
  const output = JSON.parse(fs.readFileSync(path.join(root, 'schemas/governance-analysis.output.schema.json'), 'utf8'));
  assert.equal(output.additionalProperties, false);
  assert.ok(output.required.includes('requiresHumanReview'));
  assert.equal(output.properties.requiresHumanReview.const, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
  const scopes = manifest.oauthScopes.join(' ');
  assert.equal(scopes.includes('mail.google.com'), false);
  assert.equal(scopes.includes('/auth/drive'), false);
  assert.equal(scopes.includes('/auth/userinfo.email'), false);
  assert.equal(Object.hasOwn(manifest, 'executionApi'), false);
});

test('deploy de staging é manual, isolado e não executa runtime', () => {
  const workflow = fs.readFileSync(
    path.resolve(root, '..', '.github/workflows/deploy-hospital-governance-kernel-staging.yml'),
    'utf8'
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /HGK_APPS_SCRIPT_ID_HML/);
  assert.match(workflow, /Refusing to target the operational Apps Script project/);
  assert.doesNotMatch(workflow, /\bclasp\s+run\s+HKGK_/);
  assert.doesNotMatch(workflow, /HKGK_installStagingTriggers\s*\(/);
});

test('runbook mantém scan sintético com dispatch bloqueado e encerra em hard stop', () => {
  const runbook = fs.readFileSync(path.join(root, 'docs/RUNBOOK.md'), 'utf8');
  const prepare = runbook.indexOf("HKGK_pause('preparar corpus sintetico: <changeId>', 'DISPATCH')");
  const generate = runbook.indexOf('HKGK_generateSyntheticFixtures()');
  const scan = runbook.indexOf('HKGK_scanInboxTick()');
  const resume = runbook.indexOf("HKGK_resume('canario sintetico dry-run aprovado: <changeId>')");
  const hardStop = runbook.indexOf("HKGK_pause('fim do canario sintetico: <changeId>', 'ALL')");
  assert.ok(prepare >= 0 && prepare < generate);
  assert.ok(generate < scan && scan < resume && resume < hardStop);
  assert.match(runbook, /soft pause \| `HKGK_pause\('motivo', 'DISPATCH'\)`/);
  assert.match(runbook, /hard stop \| `HKGK_pause\('motivo', 'ALL'\)`/);
});

test('dashboard tem alternativa textual, URL Apps Script, export e estados degradados', () => {
  const html = ['Index.html', 'Styles.html', 'App.html'].map(file => fs.readFileSync(path.join(root, 'src', file), 'utf8')).join('\n');
  assert.match(html, /<table>/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /OFFLINE/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /URLSearchParams/);
  assert.match(html, /google\.script\.url\.getLocation/);
  assert.match(html, /google\.script\.history/);
  assert.match(html, /requestSequence/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /active-filters/);
  assert.match(html, /queue-count/);
  assert.match(html, /@media print/);
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(html, /error\s*&&\s*error\.message/);
});
