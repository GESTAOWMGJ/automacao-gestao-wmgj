/** Contratos canônicos e validação default-deny. */

function hkgkEnums_() {
  return Object.freeze({
    documentStates: [
      'RECEIVED', 'CLASSIFIED', 'EXTRACTED', 'NORMALIZED', 'PENDING_EVIDENCE',
      'PENDING_HUMAN_REVIEW', 'VALIDATED', 'CLOSED', 'BLOCKED', 'CANCELLED'
    ],
    queueStates: [
      'READY', 'LEASED', 'RETRY_WAIT', 'DRY_RUN_VALIDATED', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'
    ],
    reviewStates: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED'],
    riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    sensitivities: ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CLINICAL_SENSITIVE'],
    actorTypes: ['SYSTEM', 'USER', 'AI'],
    sourceSystems: ['DRIVE', 'SHEETS', 'GMAIL', 'API', 'MANUAL', 'SYNTHETIC'],
    eventTypes: [
      'GOVERNANCE_CASE_UPSERT', 'AUDIT_FINDING_RECORDED', 'ACTION_ITEM_UPSERT',
      'APPROVAL_REQUESTED', 'AI_RUN_RECORDED', 'RUNTIME_CHECKPOINT'
    ]
  });
}

function hkgkValidateEventEnvelope_(event) {
  var errors = [];
  var enums = hkgkEnums_();
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, errors: ['EVENT_NOT_OBJECT'] };
  }
  hkgkRejectUnknownKeys_(event, [
    'envelopeVersion', 'eventId', 'idempotencyKey', 'contentHash', 'orgId', 'facilityId',
    'eventType', 'aggregate', 'schemaVersion', 'occurredAt', 'producedAt', 'correlationId',
    'causationId', 'traceId', 'source', 'classification', 'evidenceRefs', 'actor', 'algorithm', 'payload'
  ], 'event', errors);
  hkgkRequiredString_(event.eventId, 'eventId', 128, errors);
  hkgkRequiredString_(event.idempotencyKey, 'idempotencyKey', 512, errors);
  hkgkRequiredString_(event.contentHash, 'contentHash', 128, errors);
  hkgkRequiredString_(event.orgId, 'orgId', 64, errors);
  hkgkRequiredString_(event.facilityId, 'facilityId', 128, errors);
  hkgkRequiredString_(event.eventType, 'eventType', 128, errors);
  hkgkRequiredString_(event.occurredAt, 'occurredAt', 64, errors);
  hkgkRequiredString_(event.producedAt, 'producedAt', 64, errors);
  hkgkRequiredString_(event.correlationId, 'correlationId', 128, errors);
  hkgkRequiredString_(event.traceId, 'traceId', 128, errors);
  if (!/^[a-f0-9]{64}$/.test(String(event.idempotencyKey || ''))) errors.push('idempotencyKey:INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(event.contentHash || ''))) errors.push('contentHash:INVALID');
  if (event.envelopeVersion !== 1) errors.push('envelopeVersion:UNSUPPORTED');
  if (event.schemaVersion !== 1) errors.push('schemaVersion:UNSUPPORTED');
  if (enums.eventTypes.indexOf(event.eventType) < 0) errors.push('eventType:INVALID');
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(String(event.orgId || ''))) errors.push('orgId:INVALID');
  hkgkOpaqueIdentifier_(event.facilityId, 'facilityId', 128, errors);
  if (!hkgkIsIsoDate_(event.occurredAt) || !hkgkIsIsoDate_(event.producedAt)) errors.push('timestamp:INVALID');
  if (!event.aggregate || typeof event.aggregate !== 'object' || Array.isArray(event.aggregate)) {
    errors.push('aggregate:INVALID');
  } else {
    hkgkRejectUnknownKeys_(event.aggregate, ['type', 'id', 'expectedVersion'], 'aggregate', errors);
    hkgkRequiredString_(event.aggregate.type, 'aggregate.type', 64, errors);
    if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(String(event.aggregate.type || ''))) {
      errors.push('aggregate.type:INVALID');
    }
    hkgkRequiredString_(event.aggregate.id, 'aggregate.id', 256, errors);
    hkgkOpaqueIdentifier_(event.aggregate.id, 'aggregate.id', 256, errors);
    if (!Number.isInteger(event.aggregate.expectedVersion) || event.aggregate.expectedVersion < 0) {
      errors.push('aggregate.expectedVersion:INVALID');
    }
  }
  if (!event.source || typeof event.source !== 'object' || Array.isArray(event.source)) {
    errors.push('source:INVALID');
  } else {
    hkgkRejectUnknownKeys_(event.source, ['system', 'sourceId', 'sourceVersion'], 'source', errors);
    hkgkRequiredString_(event.source.sourceId, 'source.sourceId', 512, errors);
    hkgkRequiredString_(event.source.sourceVersion, 'source.sourceVersion', 128, errors);
    hkgkOpaqueIdentifier_(event.source.sourceId, 'source.sourceId', 512, errors);
    hkgkOpaqueIdentifier_(event.source.sourceVersion, 'source.sourceVersion', 128, errors);
  }
  if (!event.actor || typeof event.actor !== 'object' || Array.isArray(event.actor)) {
    errors.push('actor:INVALID');
  } else {
    hkgkRejectUnknownKeys_(event.actor, ['type', 'id', 'roles'], 'actor', errors);
    hkgkRequiredString_(event.actor.id, 'actor.id', 256, errors);
    hkgkOpaqueIdentifier_(event.actor.id, 'actor.id', 256, errors);
    if (!Array.isArray(event.actor.roles) || event.actor.roles.length > 20 || event.actor.roles.some(function(role) {
      return typeof role !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(role);
    })) errors.push('actor.roles:INVALID');
  }
  if (!Array.isArray(event.evidenceRefs) || event.evidenceRefs.length > 200 || event.evidenceRefs.some(function(ref) {
    return !hkgkIsSafeEvidenceRef_(ref);
  })) errors.push('evidenceRefs:INVALID');
  if (!event.classification || typeof event.classification !== 'object' || Array.isArray(event.classification)) {
    errors.push('classification.sensitivity:INVALID');
  } else {
    hkgkRejectUnknownKeys_(event.classification, ['sensitivity', 'clinical'], 'classification', errors);
    if (enums.sensitivities.indexOf(event.classification.sensitivity) < 0) {
      errors.push('classification.sensitivity:INVALID');
    }
    if (typeof event.classification.clinical !== 'boolean') errors.push('classification.clinical:INVALID');
  }
  if (event.actor && enums.actorTypes.indexOf(event.actor.type) < 0) errors.push('actor.type:INVALID');
  if (event.source && enums.sourceSystems.indexOf(event.source.system) < 0) errors.push('source.system:INVALID');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) errors.push('payload:INVALID');
  if (event.payload && (
    hkgkFindDirectIdentifiers_(event.payload).length > 0 || hkgkContainsDirectIdentifierValue_(event.payload)
  )) errors.push('payload:DIRECT_IDENTIFIER_FORBIDDEN');
  if (event.payload && hkgkFindSecretFields_(event.payload).length > 0) errors.push('payload:SECRET_FIELD_FORBIDDEN');
  if (!event.algorithm || typeof event.algorithm !== 'object' || Array.isArray(event.algorithm)) {
    errors.push('algorithm:INVALID');
  } else {
    hkgkRejectUnknownKeys_(
      event.algorithm, ['version', 'ruleSetVersion', 'promptVersion', 'model'], 'algorithm', errors
    );
    ['version', 'ruleSetVersion', 'promptVersion', 'model'].forEach(function(field) {
      hkgkRequiredString_(event.algorithm[field], 'algorithm.' + field, 128, errors);
    });
  }
  var serialized = '';
  try { serialized = JSON.stringify(event); } catch (serializationError) { errors.push('event:NOT_JSON_SERIALIZABLE'); }
  if (serialized.length > HKGK_MAX_CELL_CHARS) errors.push('event:TOO_LARGE_FOR_OUTBOX');
  if (/^[a-f0-9]{64}$/.test(String(event.idempotencyKey || '')) &&
      hkgkIdempotencyKey_(event) !== event.idempotencyKey) errors.push('idempotencyKey:MISMATCH');
  if (/^[a-f0-9]{64}$/.test(String(event.contentHash || '')) &&
      hkgkContentHash_(event) !== event.contentHash) errors.push('contentHash:MISMATCH');
  return { ok: errors.length === 0, errors: errors };
}

function hkgkRequiredString_(value, field, maxLength, errors) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(field + ':REQUIRED');
  else if (value.length > maxLength) errors.push(field + ':TOO_LONG');
}

function hkgkIsIsoDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function hkgkFindDirectIdentifiers_(value, path) {
  path = path || '';
  var found = [];
  if (!value || typeof value !== 'object') return found;
  Object.keys(value).forEach(function(key) {
    var childPath = path ? path + '.' + key : key;
    if (hkgkIsDirectIdentifierKey_(key)) found.push(childPath);
    var child = value[key];
    if (child && typeof child === 'object') found = found.concat(hkgkFindDirectIdentifiers_(child, childPath));
  });
  return found;
}

function hkgkContainsDirectIdentifierValue_(value) {
  var text = JSON.stringify(value || {});
  return /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(text) ||
    /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(text) ||
    /\b\d{15}\b/.test(text) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /(?:\+?55\s*)?\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4}/.test(text);
}

function hkgkRejectUnknownKeys_(value, allowed, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  Object.keys(value).forEach(function(key) {
    if (allowed.indexOf(key) < 0) errors.push(path + '.' + key + ':UNKNOWN');
  });
}

function hkgkOpaqueIdentifier_(value, field, maxLength, errors) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength ||
      !/^[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(value) || hkgkContainsDirectIdentifierValue_(value)) {
    errors.push(field + ':NOT_OPAQUE');
  }
}

function hkgkIsSafeEvidenceRef_(value) {
  return typeof value === 'string' && value.length <= 512 &&
    /^(synthetic|drive|firestore|source):\/\/[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(value) &&
    !hkgkContainsDirectIdentifierValue_(value);
}

function hkgkFindSecretFields_(value, path) {
  path = path || '';
  var secret = /(^|_)(secret|access_?token|refresh_?token|password|senha|api_?key|authorization_?header|cookie)($|_)/i;
  var camelSecret = /^(accessToken|refreshToken|apiKey|authorizationHeader)$/i;
  var found = [];
  if (!value || typeof value !== 'object') return found;
  Object.keys(value).forEach(function(key) {
    var childPath = path ? path + '.' + key : key;
    if (secret.test(key) || camelSecret.test(key)) found.push(childPath);
    var child = value[key];
    if (child && typeof child === 'object') found = found.concat(hkgkFindSecretFields_(child, childPath));
  });
  return found;
}

function hkgkBuildEnvelope_(input, context) {
  input = input || {};
  context = context || {};
  var now = context.now || new Date().toISOString();
  var traceId = context.traceId || hkgkUuid_();
  var directIdentifiers = hkgkFindDirectIdentifiers_(input.payload || {});
  if (directIdentifiers.length > 0 || hkgkContainsDirectIdentifierValue_(input.payload || {})) {
    throw hkgkError_(
      'DIRECT_IDENTIFIER_FORBIDDEN',
      directIdentifiers.join(','),
      traceId,
      false
    );
  }
  var secretFields = hkgkFindSecretFields_(input.payload || {});
  if (secretFields.length > 0) {
    throw hkgkError_('SECRET_FIELD_FORBIDDEN', secretFields.join(','), traceId, false);
  }
  var source = {
    system: String(input.sourceSystem || 'SYNTHETIC').toUpperCase(),
    sourceId: String(input.sourceId || ''),
    sourceVersion: String(input.sourceVersion || '')
  };
  var payload = hkgkSanitizePayload_(input.payload || {});
  var event = {
    envelopeVersion: 1,
    eventId: context.eventId || hkgkUuid_(),
    idempotencyKey: '',
    contentHash: '',
    orgId: String(input.orgId || context.orgId || ''),
    facilityId: String(input.facilityId || 'unassigned'),
    eventType: String(input.eventType || 'GOVERNANCE_CASE_UPSERT'),
    aggregate: {
      type: String(input.aggregateType || 'governanceCase'),
      id: String(input.aggregateId || input.sourceId || ''),
      expectedVersion: Math.max(0, Number(input.expectedVersion || 0))
    },
    schemaVersion: 1,
    occurredAt: String(input.occurredAt || now),
    producedAt: now,
    correlationId: String(input.correlationId || traceId),
    causationId: String(input.causationId || ''),
    traceId: traceId,
    source: source,
    classification: {
      sensitivity: String(input.sensitivity || 'RESTRICTED').toUpperCase(),
      clinical: Boolean(input.clinical)
    },
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(String) : [],
    actor: {
      type: String(input.actorType || 'SYSTEM').toUpperCase(),
      id: String(input.actorId || 'apps-script'),
      roles: Array.isArray(input.actorRoles) ? input.actorRoles.map(String) : []
    },
    algorithm: {
      version: String(input.algorithmVersion || HKGK_VERSION),
      ruleSetVersion: String(input.ruleSetVersion || 'rules-1'),
      promptVersion: String(input.promptVersion || 'none'),
      model: String(input.model || 'none')
    },
    payload: payload
  };
  event.idempotencyKey = hkgkIdempotencyKey_(event);
  event.contentHash = hkgkContentHash_(event);
  var validation = hkgkValidateEventEnvelope_(event);
  if (!validation.ok) throw hkgkError_('EVENT_CONTRACT_INVALID', validation.errors.join(','), traceId, false);
  return event;
}
