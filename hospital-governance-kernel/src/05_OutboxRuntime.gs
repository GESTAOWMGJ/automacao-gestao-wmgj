/** Outbox local com idempotência, lease curto, retry limitado e dead-letter. */

function hkgkEnqueueEvent_(event) {
  var validation = hkgkValidateEventEnvelope_(event);
  if (!validation.ok) throw hkgkError_('EVENT_CONTRACT_INVALID', validation.errors.join(','), event.traceId, false);
  return hkgkWithScriptLock_(5000, function() {
    var matches = hkgkFindBy_('HKGK_OUTBOX', 'IDEMPOTENCY_KEY', event.idempotencyKey, 10000);
    if (matches.length) {
      var existing = matches[matches.length - 1];
      if (existing.CONTENT_HASH !== event.contentHash) {
        hkgkDeadLetterCollision_(existing, event);
        throw hkgkError_('IDEMPOTENCY_COLLISION', event.idempotencyKey, event.traceId, false);
      }
      return { enqueued: false, duplicate: true, jobId: existing.JOB_ID, status: existing.STATUS };
    }
    var now = hkgkNowIso_();
    var jobId = hkgkUuid_();
    hkgkAppendObject_('HKGK_OUTBOX', {
      JOB_ID: jobId,
      IDEMPOTENCY_KEY: event.idempotencyKey,
      CONTENT_HASH: event.contentHash,
      EVENT_JSON: JSON.stringify(event),
      STATUS: 'READY',
      ATTEMPTS: '0',
      NEXT_ATTEMPT_AT: now,
      LEASE_TOKEN: '',
      LEASE_EXPIRES_AT: '',
      LAST_ERROR_CODE: '',
      RECEIPT_JSON: '',
      TRACE_ID: event.traceId,
      CREATED_AT: now,
      UPDATED_AT: now
    });
    return { enqueued: true, duplicate: false, jobId: jobId, status: 'READY' };
  });
}

function hkgkDeadLetterCollision_(existing, incoming) {
  hkgkAppendObject_('HKGK_DEAD_LETTERS', {
    DEAD_LETTER_ID: hkgkUuid_(),
    ORIGINAL_JOB_ID: existing.JOB_ID,
    IDEMPOTENCY_KEY: incoming.idempotencyKey,
    CONTENT_HASH: incoming.contentHash,
    ERROR_CODE: 'IDEMPOTENCY_COLLISION',
    ERROR_DETAIL: 'same_key_different_content_hash',
    TRACE_ID: incoming.traceId,
    CAUSATION_ID: incoming.causationId || incoming.eventId,
    CREATED_AT: hkgkNowIso_()
  });
}

function hkgkClaimJobs_(limit, leaseSeconds, config) {
  return hkgkWithScriptLock_(5000, function() {
    var now = Date.now();
    var due = hkgkReadObjects_('HKGK_OUTBOX', 10000).filter(function(job) {
      var releaseDryRun = Boolean(config && !config.dryRun && config.transportApproved);
      var statusEligible = job.STATUS === 'READY' || job.STATUS === 'RETRY_WAIT' ||
        (releaseDryRun && job.STATUS === 'DRY_RUN_VALIDATED');
      var parsedDue = Date.parse(job.NEXT_ATTEMPT_AT || '');
      var nextDue = !job.NEXT_ATTEMPT_AT || (Number.isFinite(parsedDue) && parsedDue <= now) ||
        (releaseDryRun && job.STATUS === 'DRY_RUN_VALIDATED');
      return statusEligible && nextDue;
    }).slice(0, limit);
    return due.map(function(job) {
      var leaseToken = hkgkUuid_();
      var expiresAt = new Date(now + leaseSeconds * 1000).toISOString();
      hkgkUpdateRow_('HKGK_OUTBOX', job.__rowNumber, {
        STATUS: 'LEASED',
        LEASE_TOKEN: leaseToken,
        LEASE_EXPIRES_AT: expiresAt,
        UPDATED_AT: hkgkNowIso_()
      });
      job.STATUS = 'LEASED';
      job.LEASE_TOKEN = leaseToken;
      job.LEASE_EXPIRES_AT = expiresAt;
      return job;
    });
  });
}

function hkgkSafeDispatchBatch_(config) {
  var reserveMs = 15000;
  var perJobMs = Math.max(1000, Number(config.apiTimeoutMs || 20000)) + 2000;
  var leaseBudgetMs = Math.max(perJobMs, Number(config.leaseSeconds || 120) * 1000 - reserveMs);
  var byLease = Math.max(1, Math.floor(leaseBudgetMs / perJobMs));
  return Math.max(1, Math.min(Number(config.maxBatch || 1), Number(config.maxDispatchBatch || 1), byLease));
}

function hkgkMarkDryRunValidated_(job) {
  return hkgkWithScriptLock_(5000, function() {
    var latest = hkgkReadObjects_('HKGK_OUTBOX', 10000).filter(function(row) {
      return row.JOB_ID === job.JOB_ID;
    })[0];
    if (!latest || latest.STATUS !== 'LEASED' || latest.LEASE_TOKEN !== job.LEASE_TOKEN) {
      throw hkgkError_('STALE_LEASE_DRY_RUN_FORBIDDEN', job.JOB_ID, job.TRACE_ID, false);
    }
    if (Date.parse(latest.LEASE_EXPIRES_AT) <= Date.now()) {
      throw hkgkError_('LEASE_EXPIRED', job.JOB_ID, job.TRACE_ID, true);
    }
    hkgkUpdateRow_('HKGK_OUTBOX', latest.__rowNumber, {
      STATUS: 'DRY_RUN_VALIDATED',
      RECEIPT_JSON: '',
      LEASE_TOKEN: '',
      LEASE_EXPIRES_AT: '',
      NEXT_ATTEMPT_AT: '',
      LAST_ERROR_CODE: '',
      UPDATED_AT: hkgkNowIso_()
    });
    return 'DRY_RUN_VALIDATED';
  });
}

function hkgkAckJob_(job, receipt) {
  hkgkValidateBackendReceipt_(receipt, job);
  hkgkWithScriptLock_(5000, function() {
    var latest = hkgkReadObjects_('HKGK_OUTBOX', 10000).filter(function(row) {
      return row.JOB_ID === job.JOB_ID;
    })[0];
    if (!latest || latest.STATUS !== 'LEASED' || latest.LEASE_TOKEN !== job.LEASE_TOKEN) {
      throw hkgkError_('STALE_LEASE_ACK_FORBIDDEN', job.JOB_ID, job.TRACE_ID, false);
    }
    if (Date.parse(latest.LEASE_EXPIRES_AT) <= Date.now()) {
      throw hkgkError_('LEASE_EXPIRED', job.JOB_ID, job.TRACE_ID, true);
    }
    var receiptExists = hkgkReadObjects_('HKGK_RECEIPTS', 10000).some(function(row) {
      return row.IDEMPOTENCY_KEY === job.IDEMPOTENCY_KEY && row.CONTENT_HASH === job.CONTENT_HASH;
    });
    if (!receiptExists) {
      hkgkAppendObject_('HKGK_RECEIPTS', {
        RECEIPT_ID: receipt.receiptId,
        EVENT_ID: receipt.eventId,
        IDEMPOTENCY_KEY: job.IDEMPOTENCY_KEY,
        CONTENT_HASH: job.CONTENT_HASH,
        BACKEND_STATUS: receipt.duplicate ? 'DUPLICATE' : 'ACCEPTED',
        AGGREGATE_VERSION: receipt.aggregateVersion,
        AUDIT_EVENT_ID: receipt.auditEventId,
        RECEIVED_AT: hkgkNowIso_(),
        TRACE_ID: job.TRACE_ID
      });
    }
    hkgkUpdateRow_('HKGK_OUTBOX', latest.__rowNumber, {
      STATUS: 'SUCCEEDED',
      RECEIPT_JSON: JSON.stringify(receipt),
      LEASE_TOKEN: '',
      LEASE_EXPIRES_AT: '',
      UPDATED_AT: hkgkNowIso_()
    });
  });
}

function hkgkValidateBackendReceipt_(receipt, job) {
  var errors = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw hkgkError_('BACKEND_RECEIPT_INVALID', 'NOT_OBJECT', job && job.TRACE_ID, true);
  }
  if (receipt.ok !== true) errors.push('OK_REQUIRED');
  if (typeof receipt.accepted !== 'boolean' || typeof receipt.duplicate !== 'boolean' ||
      receipt.accepted === receipt.duplicate) errors.push('ACCEPTED_DUPLICATE_XOR_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(String(receipt.contentHash || ''))) errors.push('CONTENT_HASH_INVALID');
  else if (!job || receipt.contentHash !== job.CONTENT_HASH) errors.push('CONTENT_HASH_MISMATCH');
  if (!/^[a-f0-9]{64}$/.test(String(receipt.semanticHash || ''))) errors.push('SEMANTIC_HASH_INVALID');
  ['receiptId', 'entityId', 'eventId', 'auditEventId'].forEach(function(field) {
    if (typeof receipt[field] !== 'string' || receipt[field].trim() === '' || receipt[field].length > 256) {
      errors.push(field.toUpperCase() + '_INVALID');
    }
  });
  if (!Number.isInteger(receipt.aggregateVersion) || receipt.aggregateVersion < 1) {
    errors.push('AGGREGATE_VERSION_INVALID');
  }
  if (errors.length) {
    throw hkgkError_('BACKEND_RECEIPT_INVALID', errors.join(','), job && job.TRACE_ID, true);
  }
  return true;
}

function hkgkFailJob_(job, error, config) {
  return hkgkWithScriptLock_(5000, function() {
    var latest = hkgkReadObjects_('HKGK_OUTBOX', 10000).filter(function(row) {
      return row.JOB_ID === job.JOB_ID;
    })[0];
    if (!latest || latest.STATUS !== 'LEASED' || latest.LEASE_TOKEN !== job.LEASE_TOKEN) {
      return 'STALE_LEASE';
    }
    var parsedAttempts = Number(latest.ATTEMPTS || 0);
    var attempt = Number.isInteger(parsedAttempts) && parsedAttempts >= 0
      ? parsedAttempts + 1
      : config.maxAttempts;
    var code = String(error.code || 'UNEXPECTED_ERROR');
    var seed = parseInt(String(latest.CONTENT_HASH || '').slice(0, 8), 16) || 0;
    var retryableOverride = typeof error.retryable === 'boolean' ? error.retryable : undefined;
    var decision = hkgkRetryDecision_(code, attempt, config.maxAttempts, seed, retryableOverride);
    if (decision.action === 'RETRY_WAIT') {
      hkgkUpdateRow_('HKGK_OUTBOX', latest.__rowNumber, {
        STATUS: 'RETRY_WAIT',
        ATTEMPTS: String(attempt),
        NEXT_ATTEMPT_AT: new Date(Date.now() + decision.delayMs).toISOString(),
        LEASE_TOKEN: '',
        LEASE_EXPIRES_AT: '',
        LAST_ERROR_CODE: code,
        UPDATED_AT: hkgkNowIso_()
      });
      return 'RETRY_WAIT';
    }
    hkgkUpdateRow_('HKGK_OUTBOX', latest.__rowNumber, {
      STATUS: 'DEAD_LETTER',
      ATTEMPTS: String(attempt),
      LEASE_TOKEN: '',
      LEASE_EXPIRES_AT: '',
      LAST_ERROR_CODE: code,
      UPDATED_AT: hkgkNowIso_()
    });
    hkgkAppendObject_('HKGK_DEAD_LETTERS', {
      DEAD_LETTER_ID: hkgkUuid_(),
      ORIGINAL_JOB_ID: latest.JOB_ID,
      IDEMPOTENCY_KEY: latest.IDEMPOTENCY_KEY,
      CONTENT_HASH: latest.CONTENT_HASH,
      ERROR_CODE: code,
      ERROR_DETAIL: hkgkSanitizeErrorDetail_(error.safeDetail || error.message),
      TRACE_ID: latest.TRACE_ID,
      CAUSATION_ID: latest.JOB_ID,
      CREATED_AT: hkgkNowIso_()
    });
    return 'DEAD_LETTER';
  });
}

function hkgkRecoverExpiredLeases_(config) {
  var recovered = { retry: 0, deadLetter: 0 };
  hkgkWithScriptLock_(5000, function() {
    hkgkReadObjects_('HKGK_OUTBOX', 10000).forEach(function(job) {
      if (job.STATUS !== 'LEASED' || !job.LEASE_EXPIRES_AT || Date.parse(job.LEASE_EXPIRES_AT) > Date.now()) return;
      var parsedAttempts = Number(job.ATTEMPTS || 0);
      var attempt = Number.isInteger(parsedAttempts) && parsedAttempts >= 0
        ? parsedAttempts + 1
        : config.maxAttempts;
      var seed = parseInt(String(job.CONTENT_HASH || '').slice(0, 8), 16) || 0;
      var decision = hkgkRetryDecision_('LEASE_EXPIRED', attempt, config.maxAttempts, seed);
      if (decision.action === 'RETRY_WAIT') {
        hkgkUpdateRow_('HKGK_OUTBOX', job.__rowNumber, {
          STATUS: 'RETRY_WAIT',
          ATTEMPTS: String(attempt),
          NEXT_ATTEMPT_AT: new Date(Date.now() + decision.delayMs).toISOString(),
          LEASE_TOKEN: '',
          LEASE_EXPIRES_AT: '',
          LAST_ERROR_CODE: 'LEASE_EXPIRED',
          UPDATED_AT: hkgkNowIso_()
        });
        recovered.retry++;
        return;
      }
      hkgkUpdateRow_('HKGK_OUTBOX', job.__rowNumber, {
        STATUS: 'DEAD_LETTER',
        ATTEMPTS: String(attempt),
        LEASE_TOKEN: '',
        LEASE_EXPIRES_AT: '',
        LAST_ERROR_CODE: 'LEASE_EXPIRED',
        UPDATED_AT: hkgkNowIso_()
      });
      hkgkAppendObject_('HKGK_DEAD_LETTERS', {
        DEAD_LETTER_ID: hkgkUuid_(),
        ORIGINAL_JOB_ID: job.JOB_ID,
        IDEMPOTENCY_KEY: job.IDEMPOTENCY_KEY,
        CONTENT_HASH: job.CONTENT_HASH,
        ERROR_CODE: 'LEASE_EXPIRED',
        ERROR_DETAIL: 'maximum_attempts_reached',
        TRACE_ID: job.TRACE_ID,
        CAUSATION_ID: job.JOB_ID,
        CREATED_AT: hkgkNowIso_()
      });
      recovered.deadLetter++;
    });
  });
  return recovered;
}
