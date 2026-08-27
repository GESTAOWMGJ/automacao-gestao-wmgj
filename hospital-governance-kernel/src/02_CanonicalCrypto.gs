/** JSON canônico, hashes, redaction e erros tipados. */

function hkgkCanonicalize_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(hkgkCanonicalize_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + hkgkCanonicalize_(value[key]);
  }).join(',') + '}';
}

function hkgkSha256Hex_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return digest.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function hkgkContentHash_(event) {
  event = event || {};
  var stableContent = {
    envelopeVersion: event.envelopeVersion,
    idempotencyKey: event.idempotencyKey,
    orgId: event.orgId,
    facilityId: event.facilityId,
    eventType: event.eventType,
    aggregate: event.aggregate,
    schemaVersion: event.schemaVersion,
    source: event.source,
    classification: event.classification,
    evidenceRefs: event.evidenceRefs,
    actor: event.actor,
    algorithm: event.algorithm,
    payload: event.payload
  };
  return hkgkSha256Hex_(hkgkCanonicalize_(stableContent));
}

function hkgkIdempotencyKey_(event) {
  var identity = [
    event.orgId,
    'HKGK_APPS_SCRIPT',
    event.facilityId,
    event.eventType,
    event.aggregate && event.aggregate.type,
    event.aggregate && event.aggregate.id,
    event.aggregate && event.aggregate.expectedVersion,
    event.source && event.source.system,
    event.source && event.source.sourceId,
    event.source && event.source.sourceVersion,
    event.schemaVersion,
    event.algorithm && event.algorithm.version,
    event.algorithm && event.algorithm.ruleSetVersion,
    event.algorithm && event.algorithm.promptVersion,
    event.algorithm && event.algorithm.model
  ];
  return hkgkSha256Hex_(hkgkCanonicalize_(identity));
}

function hkgkHmacHex_(value, secret) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(value || ''), String(secret || ''), Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function hkgkSanitizePayload_(value) {
  var secret = /(^|_)(secret|access_?token|refresh_?token|password|senha|api_?key|authorization_?header|cookie)($|_)/i;
  var camelSecret = /^(accessToken|refreshToken|apiKey|authorizationHeader)$/i;
  if (Array.isArray(value)) return value.map(hkgkSanitizePayload_);
  if (!value || typeof value !== 'object') return value;
  var output = {};
  Object.keys(value).forEach(function(key) {
    if (hkgkIsDirectIdentifierKey_(key)) return;
    output[key] = secret.test(key) || camelSecret.test(key) ? '[REDACTED]' : hkgkSanitizePayload_(value[key]);
  });
  return output;
}

function hkgkSanitizeErrorDetail_(value) {
  var text = String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/([A-Za-z0-9_-]*(?:secret|token|password|senha|api[_-]?key)[A-Za-z0-9_-]*)\s*[:=]\s*[^,;\s]+/gi, '$1=[REDACTED]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_REDACTED]')
    .replace(/\b\d{15}\b/g, '[CNS_REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g, '[PHONE_REDACTED]');
}

function hkgkNormalizeFieldName_(key) {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function hkgkIsDirectIdentifierKey_(key) {
  var normalized = hkgkNormalizeFieldName_(key);
  return /^(cpf|cnpj|cns|rg|email|e_mail|phone|phone_number|telefone|celular|mobile|mobile_phone|birth_date|date_of_birth|dob|data_nascimento|address|endereco|cep|national_id|patient_id|patient_name|nome_paciente|beneficiary_id|beneficiary_name|nome_beneficiario|prontuario|medical_record)$/.test(normalized);
}

function hkgkError_(code, detail, traceId, retryable) {
  var error = new Error(String(code));
  error.code = String(code);
  error.safeDetail = hkgkSanitizeErrorDetail_(detail);
  error.traceId = String(traceId || hkgkUuid_());
  error.retryable = Boolean(retryable);
  return error;
}

function hkgkUuid_() {
  return Utilities.getUuid();
}

function hkgkNowIso_() {
  return new Date().toISOString();
}
