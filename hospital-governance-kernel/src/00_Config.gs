/** WMGJ Hospital Governance Kernel — configuração sem efeitos colaterais. */

var HKGK_VERSION = '1.0.0-hml';
var HKGK_SCHEMA_VERSION = 1;
var HKGK_MAX_CELL_CHARS = 45000;

function hkgkDefaults_() {
  return Object.freeze({
    env: 'staging',
    orgId: 'wmgj-sandbox',
    dryRun: true,
    killSwitch: true,
    clinicalMode: 'disabled',
    maxBatch: 20,
    maxDispatchBatch: 5,
    leaseSeconds: 120,
    maxAttempts: 5,
    apiTimeoutMs: 20000,
    dashboardStaleSeconds: 180
  });
}

function hkgkTableDefinitions_() {
  return {
    HKGK_INBOX: [
      'SOURCE_SYSTEM', 'SOURCE_ID', 'SOURCE_VERSION', 'ENTITY_TYPE', 'FACILITY_ID',
      'SENSITIVITY', 'EVIDENCE_REFS_JSON', 'PAYLOAD_JSON', 'STATUS', 'ATTEMPTS',
      'LAST_ERROR_CODE', 'TRACE_ID', 'CREATED_AT', 'UPDATED_AT', 'NEXT_ATTEMPT_AT',
      'EXPECTED_VERSION'
    ],
    HKGK_OUTBOX: [
      'JOB_ID', 'IDEMPOTENCY_KEY', 'CONTENT_HASH', 'EVENT_JSON', 'STATUS', 'ATTEMPTS',
      'NEXT_ATTEMPT_AT', 'LEASE_TOKEN', 'LEASE_EXPIRES_AT', 'LAST_ERROR_CODE',
      'RECEIPT_JSON', 'TRACE_ID', 'CREATED_AT', 'UPDATED_AT'
    ],
    HKGK_DEAD_LETTERS: [
      'DEAD_LETTER_ID', 'ORIGINAL_JOB_ID', 'IDEMPOTENCY_KEY', 'CONTENT_HASH',
      'ERROR_CODE', 'ERROR_DETAIL', 'TRACE_ID', 'CAUSATION_ID', 'CREATED_AT'
    ],
    HKGK_RUNS: [
      'RUN_ID', 'RUN_TYPE', 'STATUS', 'ITEMS_READ', 'ITEMS_ACCEPTED', 'ITEMS_DUPLICATE',
      'ITEMS_RETRY', 'ITEMS_DEAD_LETTER', 'ERROR_CODE', 'STARTED_AT', 'FINISHED_AT', 'TRACE_ID',
      'ITEMS_DRY_RUN_VALIDATED'
    ],
    HKGK_RECEIPTS: [
      'RECEIPT_ID', 'EVENT_ID', 'IDEMPOTENCY_KEY', 'CONTENT_HASH', 'BACKEND_STATUS',
      'AGGREGATE_VERSION', 'AUDIT_EVENT_ID', 'RECEIVED_AT', 'TRACE_ID'
    ],
    HKGK_DASHBOARD_CACHE: [
      'SNAPSHOT_ID', 'GENERATED_AT', 'SOURCE_STATUS', 'SUMMARY_JSON', 'TRACE_ID'
    ],
    HKGK_META: [
      'MARKER_KEY', 'MARKER_VALUE', 'SPREADSHEET_ID', 'CREATED_AT'
    ]
  };
}

function hkgkGetConfig_() {
  var defaults = hkgkDefaults_();
  var props = PropertiesService.getScriptProperties();
  var rawKillSwitch = hkgkBoolean_(props.getProperty('HKGK_KILL_SWITCH'), defaults.killSwitch);
  var pauseMode = String(
    props.getProperty('HKGK_KILL_SWITCH_MODE') || (rawKillSwitch ? 'ALL' : 'NONE')
  ).trim().toUpperCase();
  return {
    version: HKGK_VERSION,
    schemaVersion: HKGK_SCHEMA_VERSION,
    env: String(props.getProperty('HKGK_ENV') || defaults.env).trim().toLowerCase(),
    orgId: String(props.getProperty('HKGK_ORG_ID') || defaults.orgId).trim().toLowerCase(),
    dryRun: hkgkBoolean_(props.getProperty('HKGK_DRY_RUN'), defaults.dryRun),
    killSwitch: pauseMode !== 'NONE',
    pauseMode: pauseMode,
    transportApproved: hkgkBoolean_(props.getProperty('HKGK_TRANSPORT_APPROVED'), false),
    clinicalMode: String(props.getProperty('HKGK_CLINICAL_MODE') || defaults.clinicalMode).trim().toLowerCase(),
    ingestUrl: String(props.getProperty('HKGK_INGEST_URL') || '').trim(),
    ingestKeyId: String(props.getProperty('HKGK_INGEST_KEY_ID') || '').trim(),
    ingestSecret: String(props.getProperty('HKGK_INGEST_HMAC_SECRET') || ''),
    dataSpreadsheetId: String(props.getProperty('HKGK_DATA_SPREADSHEET_ID') || '').trim(),
    dataSpreadsheetMarker: String(props.getProperty('HKGK_DATA_SPREADSHEET_MARKER') || '').trim(),
    maxBatch: hkgkBoundedInteger_(props.getProperty('HKGK_MAX_BATCH'), defaults.maxBatch, 1, 100),
    maxDispatchBatch: hkgkBoundedInteger_(
      props.getProperty('HKGK_MAX_DISPATCH_BATCH'), defaults.maxDispatchBatch, 1, 10
    ),
    leaseSeconds: hkgkBoundedInteger_(props.getProperty('HKGK_LEASE_SECONDS'), defaults.leaseSeconds, 30, 600),
    maxAttempts: hkgkBoundedInteger_(props.getProperty('HKGK_MAX_ATTEMPTS'), defaults.maxAttempts, 1, 10),
    apiTimeoutMs: hkgkBoundedInteger_(props.getProperty('HKGK_API_TIMEOUT_MS'), defaults.apiTimeoutMs, 1000, 60000),
    dashboardStaleSeconds: hkgkBoundedInteger_(
      props.getProperty('HKGK_DASHBOARD_STALE_SECONDS'), defaults.dashboardStaleSeconds, 30, 3600
    )
  };
}

function hkgkBoolean_(value, fallback) {
  if (value === null || typeof value === 'undefined' || value === '') return Boolean(fallback);
  return String(value).toLowerCase() === 'true';
}

function hkgkBoundedInteger_(value, fallback, min, max) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed)) parsed = fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function hkgkValidateConfig_(config) {
  var errors = [];
  var warnings = [];
  var allowedEnvs = ['staging', 'production'];
  if (allowedEnvs.indexOf(config.env) < 0) errors.push('ENV_INVALID');
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(config.orgId)) errors.push('ORG_ID_INVALID');
  if (['disabled', 'synthetic', 'enabled'].indexOf(config.clinicalMode) < 0) errors.push('CLINICAL_MODE_INVALID');
  if (['NONE', 'DISPATCH', 'ALL'].indexOf(config.pauseMode) < 0) errors.push('KILL_SWITCH_MODE_INVALID');
  if (!config.dataSpreadsheetId) warnings.push('DATA_SPREADSHEET_NOT_CONFIGURED');
  if (config.dataSpreadsheetId && !config.dataSpreadsheetMarker) errors.push('DATA_SPREADSHEET_MARKER_REQUIRED');
  if (!config.ingestUrl) warnings.push('INGEST_URL_NOT_CONFIGURED');
  if (!config.ingestKeyId) warnings.push('INGEST_KEY_ID_NOT_CONFIGURED');
  if (config.ingestUrl && !/^https:\/\//i.test(config.ingestUrl)) errors.push('INGEST_URL_MUST_USE_HTTPS');
  if (!config.dryRun && config.ingestSecret.length < 32) errors.push('HMAC_SECRET_REQUIRED');
  if (!config.dryRun && !config.ingestKeyId) errors.push('INGEST_KEY_ID_REQUIRED');
  if (!config.dryRun && !config.transportApproved) errors.push('TRANSPORT_APPROVAL_REQUIRED');
  if (config.leaseSeconds * 1000 < config.apiTimeoutMs + 15000) errors.push('LEASE_TOO_SHORT_FOR_API_TIMEOUT');
  if (config.env === 'staging' && config.orgId !== 'wmgj-sandbox') errors.push('STAGING_TENANT_MUST_BE_SANDBOX');
  if (config.env === 'staging' && config.clinicalMode === 'enabled') errors.push('CLINICAL_DATA_FORBIDDEN_IN_STAGING');
  if (config.env === 'production' && config.dryRun) warnings.push('PRODUCTION_IS_STILL_DRY_RUN');
  if (!config.killSwitch && config.dryRun) warnings.push('KILL_SWITCH_RELEASED_WHILE_DRY_RUN');
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}
