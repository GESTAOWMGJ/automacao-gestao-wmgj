/** Gateway compatível com a ingestão HMAC do PR #13. */

function hkgkToFirestoreEvent_(event) {
  var backendWorkflowStates = [
    'RECEIVED', 'QUEUED', 'CLASSIFIED', 'EXTRACTED', 'NORMALIZED', 'PENDING_EVIDENCE',
    'PENDING_HUMAN_REVIEW', 'BLOCKED', 'VALIDATED', 'CLOSED', 'CANCELLED', 'FAILED', 'DEAD_LETTER'
  ];
  var backendReviewStates = [
    'NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED'
  ];
  var workflowState = String(event.payload.workflowState || 'RECEIVED').toUpperCase();
  var reviewState = String(event.payload.reviewState || 'PENDING').toUpperCase();
  var riskLevel = hkgkNormalizeRiskLevel_(event.payload.riskLevel, 'CRITICAL');
  if (riskLevel === 'CRITICAL' && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(
    String(event.payload.riskLevel || '').toUpperCase()
  ) < 0) reviewState = 'PENDING';
  if (backendWorkflowStates.indexOf(workflowState) < 0) {
    throw hkgkError_('BACKEND_WORKFLOW_STATE_UNSUPPORTED', workflowState, event.traceId, false);
  }
  if (backendReviewStates.indexOf(reviewState) < 0) {
    throw hkgkError_('BACKEND_REVIEW_STATE_UNSUPPORTED', reviewState, event.traceId, false);
  }
  return {
    schemaVersion: 1,
    eventId: event.eventId,
    eventType: event.eventType === 'AI_RUN_RECORDED' ? 'AI_RUN_RECORDED' : 'ENTITY_UPSERT',
    orgId: event.orgId,
    occurredAt: event.occurredAt,
    idempotencyKey: event.idempotencyKey,
    entityType: event.aggregate.type,
    entityKey: event.aggregate.id,
    expectedVersion: event.aggregate.expectedVersion,
    actor: {
      type: event.actor.type,
      id: event.actor.id,
      source: 'HKGK_APPS_SCRIPT'
    },
    source: {
      system: event.source.system === 'SYNTHETIC' ? 'MANUAL' : event.source.system === 'API' ? 'APPS_SCRIPT' : event.source.system,
      sourceId: event.source.sourceId,
      sourceVersion: event.source.sourceVersion,
      contentHash: event.contentHash
    },
    workflowState: workflowState,
    reviewState: reviewState,
    riskLevel: riskLevel,
    sensitivity: event.classification.sensitivity,
    competence: String(event.payload.competence || ''),
    documentType: String(event.payload.documentType || event.aggregate.type),
    record: event.payload,
    metadata: {
      envelopeVersion: event.envelopeVersion,
      facilityId: event.facilityId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      traceId: event.traceId,
      evidenceRefs: event.evidenceRefs,
      algorithm: event.algorithm,
      nonBlockingMirror: true
    }
  };
}

function hkgkSendToFirestore_(event, config) {
  var validation = hkgkValidateEventEnvelope_(event);
  if (!validation.ok) throw hkgkError_('EVENT_CONTRACT_INVALID', validation.errors.join(','), event.traceId, false);
  if (event.orgId !== config.orgId) throw hkgkError_('EVENT_ORG_CONFIG_MISMATCH', event.orgId, event.traceId, false);
  var safety = hkgkClinicalSafety_(event, config);
  if (!safety.ok) throw hkgkError_('CLINICAL_SAFETY_BLOCK', safety.reasons.join(','), event.traceId, false);
  var firestoreEvent = hkgkToFirestoreEvent_(event);
  if (config.dryRun) {
    return {
      ok: true,
      validated: true,
      dryRun: true,
      eventId: event.eventId,
      contentHash: event.contentHash
    };
  }
  if (!config.transportApproved) {
    throw hkgkError_('TRANSPORT_APPROVAL_REQUIRED', '', event.traceId, false);
  }
  if (!config.ingestUrl || !config.ingestKeyId || config.ingestSecret.length < 32) {
    throw hkgkError_('INGEST_CONFIG_INCOMPLETE', '', event.traceId, false);
  }
  var body = JSON.stringify(firestoreEvent);
  var timestamp = String(Math.floor(Date.now() / 1000));
  var nonce = hkgkUuid_();
  var signature = hkgkHmacHex_(timestamp + '.' + body, config.ingestSecret);
  var response;
  try {
    response = UrlFetchApp.fetch(config.ingestUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      muteHttpExceptions: true,
      followRedirects: false,
      headers: {
        'X-WMGJ-Timestamp': timestamp,
        'X-WMGJ-Signature': signature,
        'X-WMGJ-Org-Id': event.orgId,
        'X-WMGJ-Idempotency-Key': event.idempotencyKey,
        'X-WMGJ-Key-Id': config.ingestKeyId,
        'X-WMGJ-Nonce': nonce,
        'X-WMGJ-Content-SHA256': event.contentHash,
        'X-Correlation-Id': event.correlationId
      }
    });
  } catch (error) {
    throw hkgkError_('NETWORK', error && error.message, event.traceId, true);
  }
  var code = response.getResponseCode();
  var parsed = hkgkParseJson_(response.getContentText());
  if (code >= 200 && code < 300) {
    return parsed;
  }
  var conflictCode = hkgkBackendConflictCode_(code, parsed);
  if (conflictCode) {
    throw hkgkError_(conflictCode, '', event.traceId, false);
  }
  var errorCode = code === 429 ? 'HTTP_429' : code >= 500 ? 'HTTP_' + code : 'HTTP_' + code;
  throw hkgkError_(errorCode, response.getContentText(), event.traceId, code === 429 || code >= 500);
}

function hkgkBackendConflictCode_(httpCode, parsed) {
  var allowed = ['IDEMPOTENCY_COLLISION', 'VERSION_CONFLICT', 'LEGACY_RECEIPT_INCOMPLETE'];
  return httpCode === 409 && parsed && allowed.indexOf(parsed.code) >= 0 ? parsed.code : '';
}

function hkgkParseJson_(text) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch (error) {
    throw hkgkError_('INVALID_JSON_RESPONSE', String(text || '').slice(0, 200), '', true);
  }
}
