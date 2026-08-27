/** Casos de uso e entrypoints finos. */

function HKGK_scanInboxTick() {
  var config = hkgkGetConfig_();
  hkgkAssertRunnable_(config, 'SCAN');
  var run = hkgkStartRun_('SCAN_INBOX');
  try {
    var nowMs = Date.now();
    var rows = hkgkReadObjects_('HKGK_INBOX', 5000).filter(function(row) {
      var retryAt = Date.parse(row.NEXT_ATTEMPT_AT || '');
      return row.STATUS === 'NEW' || (
        row.STATUS === 'RETRY_WAIT' && Number.isFinite(retryAt) && retryAt <= nowMs
      );
    }).slice(0, config.maxBatch);
    rows.forEach(function(row) {
      run.itemsRead++;
      var traceId = hkgkUuid_();
      try {
        var payload = hkgkParseJson_(row.PAYLOAD_JSON || '{}');
        var evidenceRefs = hkgkParseJson_(row.EVIDENCE_REFS_JSON || '[]');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw hkgkError_('INBOX_PAYLOAD_MUST_BE_OBJECT', '', traceId, false);
        }
        if (!Array.isArray(evidenceRefs)) {
          throw hkgkError_('EVIDENCE_REFS_MUST_BE_ARRAY', '', traceId, false);
        }
        payload.evidenceRefs = evidenceRefs;
        var ruleResult = hkgkEvaluateRulesPure_(payload);
        payload.deterministicFindings = ruleResult.findings;
        payload.riskLevel = ruleResult.overallRisk;
        payload.requiresHumanReview = ruleResult.requiresHumanReview;
        var event = hkgkBuildEnvelope_({
          orgId: config.orgId,
          facilityId: row.FACILITY_ID || 'sandbox-facility',
          eventType: 'GOVERNANCE_CASE_UPSERT',
          aggregateType: row.ENTITY_TYPE || 'governanceCase',
          aggregateId: row.SOURCE_ID,
          expectedVersion: hkgkExpectedVersionFromInbox_(row.EXPECTED_VERSION, traceId),
          sourceSystem: row.SOURCE_SYSTEM || 'SYNTHETIC',
          sourceId: row.SOURCE_ID,
          sourceVersion: row.SOURCE_VERSION,
          sensitivity: row.SENSITIVITY || 'RESTRICTED',
          clinical: row.SENSITIVITY === 'CLINICAL_SENSITIVE',
          evidenceRefs: evidenceRefs,
          payload: payload,
          ruleSetVersion: ruleResult.ruleSetVersion,
          actorType: 'SYSTEM',
          actorId: 'hkgk-apps-script'
        }, { orgId: config.orgId, traceId: traceId });
        var result = hkgkEnqueueEvent_(event);
        hkgkUpdateRow_('HKGK_INBOX', row.__rowNumber, {
          STATUS: result.duplicate ? 'DUPLICATE' : 'ENQUEUED',
          TRACE_ID: traceId,
          LAST_ERROR_CODE: '',
          NEXT_ATTEMPT_AT: '',
          UPDATED_AT: hkgkNowIso_()
        });
        if (result.duplicate) run.itemsDuplicate++;
        else run.itemsAccepted++;
      } catch (itemError) {
        var errorCode = String(itemError.code || 'UNEXPECTED_ERROR');
        var parsedAttempts = Number(row.ATTEMPTS || 0);
        var attempt = Number.isInteger(parsedAttempts) && parsedAttempts >= 0
          ? parsedAttempts + 1
          : config.maxAttempts;
        var retryDecision = hkgkRetryDecision_(
          errorCode, attempt, config.maxAttempts, row.__rowNumber,
          typeof itemError.retryable === 'boolean' ? itemError.retryable : undefined
        );
        if (retryDecision.action === 'RETRY_WAIT') {
          hkgkUpdateRow_('HKGK_INBOX', row.__rowNumber, {
            STATUS: 'RETRY_WAIT',
            ATTEMPTS: String(attempt),
            NEXT_ATTEMPT_AT: new Date(Date.now() + retryDecision.delayMs).toISOString(),
            LAST_ERROR_CODE: errorCode,
            TRACE_ID: traceId,
            UPDATED_AT: hkgkNowIso_()
          });
          run.itemsRetry++;
          return;
        }
        hkgkUpdateRow_('HKGK_INBOX', row.__rowNumber, {
          STATUS: 'REJECTED',
          ATTEMPTS: String(attempt),
          NEXT_ATTEMPT_AT: '',
          LAST_ERROR_CODE: errorCode,
          TRACE_ID: traceId,
          UPDATED_AT: hkgkNowIso_()
        });
        hkgkAppendObject_('HKGK_DEAD_LETTERS', {
          DEAD_LETTER_ID: hkgkUuid_(),
          ORIGINAL_JOB_ID: 'inbox-row-' + row.__rowNumber,
          IDEMPOTENCY_KEY: '',
          CONTENT_HASH: hkgkSha256Hex_([
            row.SOURCE_SYSTEM, row.SOURCE_ID, row.SOURCE_VERSION, row.PAYLOAD_JSON
          ].join('|')),
          ERROR_CODE: errorCode,
          ERROR_DETAIL: hkgkSanitizeErrorDetail_(itemError.safeDetail || itemError.message),
          TRACE_ID: traceId,
          CAUSATION_ID: 'source-sha256:' + hkgkSha256Hex_(String(row.SOURCE_ID || '')),
          CREATED_AT: hkgkNowIso_()
        });
        run.itemsDeadLetter++;
      }
    });
    return hkgkFinishRun_(run, 'SUCCEEDED');
  } catch (error) {
    return hkgkFinishRun_(run, 'FAILED', error);
  }
}

function hkgkExpectedVersionFromInbox_(value, traceId) {
  if (value === '' || value === null || typeof value === 'undefined') return 0;
  var parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw hkgkError_('INBOX_EXPECTED_VERSION_INVALID', value, traceId, false);
  }
  return parsed;
}

function HKGK_dispatchTick() {
  var config = hkgkGetConfig_();
  hkgkAssertRunnable_(config, 'DISPATCH');
  var run = hkgkStartRun_('DISPATCH_OUTBOX');
  try {
    var jobs = hkgkClaimJobs_(hkgkSafeDispatchBatch_(config), config.leaseSeconds, config);
    jobs.forEach(function(job) {
      run.itemsRead++;
      try {
        var event = hkgkParseJson_(job.EVENT_JSON);
        var validation = hkgkValidateEventEnvelope_(event);
        if (!validation.ok) {
          throw hkgkError_('OUTBOX_EVENT_INVALID', validation.errors.join(','), job.TRACE_ID, false);
        }
        if (event.orgId !== config.orgId) {
          throw hkgkError_('OUTBOX_ORG_CONFIG_MISMATCH', event.orgId, job.TRACE_ID, false);
        }
        if (event.idempotencyKey !== job.IDEMPOTENCY_KEY || hkgkIdempotencyKey_(event) !== job.IDEMPOTENCY_KEY) {
          throw hkgkError_('OUTBOX_IDEMPOTENCY_MISMATCH', job.JOB_ID, job.TRACE_ID, false);
        }
        if (event.contentHash !== job.CONTENT_HASH || hkgkContentHash_(event) !== job.CONTENT_HASH) {
          throw hkgkError_('OUTBOX_HASH_MISMATCH', job.JOB_ID, job.TRACE_ID, false);
        }
        hkgkAssertDispatchActor_(event.actor, job.TRACE_ID);
        var receipt = hkgkSendToFirestore_(event, config);
        if (receipt.dryRun === true && receipt.validated === true) {
          hkgkMarkDryRunValidated_(job);
          run.itemsDryRunValidated++;
        } else {
          hkgkAckJob_(job, receipt);
          if (receipt.duplicate) run.itemsDuplicate++;
          else run.itemsAccepted++;
        }
      } catch (error) {
        var action = hkgkFailJob_(job, error, config);
        if (action === 'RETRY_WAIT') run.itemsRetry++;
        else if (action === 'DEAD_LETTER') run.itemsDeadLetter++;
      }
    });
    return hkgkFinishRun_(run, 'SUCCEEDED');
  } catch (error) {
    return hkgkFinishRun_(run, 'FAILED', error);
  }
}

function HKGK_watchdogTick() {
  var config = hkgkGetConfig_();
  hkgkAssertRunnable_(config, 'WATCHDOG');
  var run = hkgkStartRun_('WATCHDOG');
  try {
    var recovered = hkgkRecoverExpiredLeases_(config);
    run.itemsRetry = recovered.retry;
    run.itemsDeadLetter = recovered.deadLetter;
    return hkgkFinishRun_(run, 'SUCCEEDED');
  } catch (error) {
    return hkgkFinishRun_(run, 'FAILED', error);
  }
}

function HKGK_reconcileDaily() {
  var config = hkgkGetConfig_();
  hkgkAssertRunnable_(config, 'READ');
  var outbox = hkgkReadObjects_('HKGK_OUTBOX', 10000);
  var receipts = hkgkReadObjects_('HKGK_RECEIPTS', 10000);
  var succeeded = outbox.filter(function(row) { return row.STATUS === 'SUCCEEDED'; });
  var receiptKeys = {};
  receipts.forEach(function(row) { receiptKeys[row.IDEMPOTENCY_KEY + '|' + row.CONTENT_HASH] = true; });
  var missing = succeeded.filter(function(row) {
    return !receiptKeys[row.IDEMPOTENCY_KEY + '|' + row.CONTENT_HASH];
  });
  return {
    ok: missing.length === 0,
    succeeded: succeeded.length,
    receipts: receipts.length,
    missingReceiptJobIds: missing.map(function(row) { return row.JOB_ID; }),
    checkedAt: hkgkNowIso_()
  };
}

function hkgkAssertRunnable_(config, operation) {
  var validation = hkgkValidateConfig_(config);
  if (!validation.ok) throw hkgkError_('CONFIG_INVALID', validation.errors.join(','), '', false);
  operation = String(operation || 'DISPATCH').toUpperCase();
  if (config.pauseMode === 'ALL' && operation !== 'READ') {
    throw hkgkError_('KILL_SWITCH_ALL_ACTIVE', operation, '', false);
  }
  if (config.pauseMode === 'DISPATCH' && operation === 'DISPATCH') {
    throw hkgkError_('KILL_SWITCH_DISPATCH_ACTIVE', operation, '', false);
  }
}

function hkgkAssertDispatchActor_(actor, traceId) {
  if (!actor || actor.type !== 'SYSTEM' || actor.id !== 'hkgk-apps-script' ||
      !Array.isArray(actor.roles) || actor.roles.length !== 0) {
    throw hkgkError_('OUTBOX_ACTOR_INVALID', actor && actor.id, traceId, false);
  }
}

function hkgkStartRun_(runType) {
  return {
    runId: hkgkUuid_(), runType: runType, status: 'RUNNING', itemsRead: 0, itemsAccepted: 0,
    itemsDuplicate: 0, itemsRetry: 0, itemsDeadLetter: 0, itemsDryRunValidated: 0,
    startedAt: hkgkNowIso_(), traceId: hkgkUuid_()
  };
}

function hkgkFinishRun_(run, status, error) {
  run.status = status;
  run.finishedAt = hkgkNowIso_();
  run.errorCode = error ? String(error.code || 'UNEXPECTED_ERROR') : '';
  hkgkAppendObject_('HKGK_RUNS', {
    RUN_ID: run.runId,
    RUN_TYPE: run.runType,
    STATUS: run.status,
    ITEMS_READ: run.itemsRead,
    ITEMS_ACCEPTED: run.itemsAccepted,
    ITEMS_DUPLICATE: run.itemsDuplicate,
    ITEMS_RETRY: run.itemsRetry,
    ITEMS_DEAD_LETTER: run.itemsDeadLetter,
    ERROR_CODE: run.errorCode,
    STARTED_AT: run.startedAt,
    FINISHED_AT: run.finishedAt,
    TRACE_ID: run.traceId,
    ITEMS_DRY_RUN_VALIDATED: run.itemsDryRunValidated
  });
  if (error) throw error;
  return run;
}
