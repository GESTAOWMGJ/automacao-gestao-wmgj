/** Motor determinístico e gates de promoção; regras remotas nunca são executáveis. */

function hkgkRuleSet_() {
  return Object.freeze({
    version: 'rules-1.0.0',
    ruleIds: [
      'EVIDENCE_REQUIRED', 'COMPETENCE_FORMAT', 'AUTHORIZATION_REQUIRED',
      'BILLED_AMOUNT_LIMIT', 'OPME_EVIDENCE_SET', 'RECONCILIATION_MATCH', 'RISK_LEVEL_INVALID'
    ]
  });
}

function hkgkEvaluateRulesPure_(record) {
  record = record || {};
  var findings = [];
  var suppliedRisk = String(record.riskLevel || 'LOW').toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(suppliedRisk) < 0) {
    findings.push(hkgkFinding_(
      'RISK_LEVEL_INVALID', 'RUNTIME', 'CRITICAL', 'Nível de risco fora do contrato; revisão humana obrigatória.'
    ));
  }
  var evidence = Array.isArray(record.evidenceRefs) ? record.evidenceRefs : [];
  if (!evidence.length) findings.push(hkgkFinding_('EVIDENCE_REQUIRED', 'DOCUMENT', 'HIGH', 'Nenhuma evidência vinculada.'));
  if (record.competence && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(record.competence))) {
    findings.push(hkgkFinding_('COMPETENCE_FORMAT', 'BILLING', 'MEDIUM', 'Competência fora do padrão YYYY-MM.'));
  }
  if (record.requiresAuthorization === true && !record.authorizationRef) {
    findings.push(hkgkFinding_('AUTHORIZATION_REQUIRED', 'BILLING', 'HIGH', 'Autorização obrigatória ausente.'));
  }
  var billed = Number(record.billedAmount);
  var authorized = Number(record.authorizedAmount);
  if (Number.isFinite(billed) && Number.isFinite(authorized) && billed > authorized) {
    findings.push(hkgkFinding_(
      'BILLED_AMOUNT_LIMIT', 'BILLING', 'HIGH',
      'Valor faturado excede o autorizado em ' + String(Math.round((billed - authorized) * 100) / 100) + '.'
    ));
  }
  if (record.opme === true) {
    var required = ['authorizationRef', 'usageEvidenceRef', 'invoiceRef', 'traceabilityRef'];
    var missing = required.filter(function(field) { return !record[field]; });
    if (missing.length) findings.push(hkgkFinding_(
      'OPME_EVIDENCE_SET', 'OPME', 'CRITICAL', 'Evidências OPME ausentes: ' + missing.join(', ') + '.'
    ));
  }
  if (record.reconciliationStatus && record.reconciliationStatus !== 'MATCHED') {
    findings.push(hkgkFinding_('RECONCILIATION_MATCH', 'BILLING', 'HIGH', 'Conciliação ainda não corresponde às fontes.'));
  }
  var risk = hkgkMaxRisk_(findings.map(function(item) { return item.riskLevel; }).concat([record.riskLevel || 'LOW']));
  return {
    ruleSetVersion: hkgkRuleSet_().version,
    findings: findings,
    overallRisk: risk,
    requiresHumanReview: findings.length > 0 || ['HIGH', 'CRITICAL'].indexOf(risk) >= 0
  };
}

function hkgkFinding_(code, domain, riskLevel, description) {
  return {
    code: code,
    domain: domain,
    riskLevel: riskLevel,
    description: description,
    status: 'OPEN',
    source: 'DETERMINISTIC_RULE'
  };
}

function hkgkMaxRisk_(levels) {
  var rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  return (levels || []).map(function(level) {
    return hkgkNormalizeRiskLevel_(level, 'CRITICAL');
  }).sort(function(a, b) {
    return (rank[b] || 1) - (rank[a] || 1);
  })[0] || 'LOW';
}

function hkgkNormalizeRiskLevel_(value, invalidFallback) {
  var normalized = String(value || 'LOW').toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(normalized) >= 0
    ? normalized
    : String(invalidFallback || 'CRITICAL').toUpperCase();
}

function hkgkAlgorithmPromotionGate_(candidate) {
  candidate = candidate || {};
  var reasons = [];
  var allowedStates = ['DRAFT', 'TESTING', 'APPROVED', 'CANARY', 'ACTIVE', 'RETIRED', 'ROLLED_BACK'];
  if (allowedStates.indexOf(candidate.status) < 0) reasons.push('ALGORITHM_STATUS_INVALID');
  if (!candidate.version || !candidate.artifactHash) reasons.push('VERSION_AND_HASH_REQUIRED');
  if (!candidate.evalReportHash) reasons.push('EVAL_REPORT_REQUIRED');
  if (!candidate.humanApprovalId) reasons.push('HUMAN_APPROVAL_REQUIRED');
  if (!candidate.rollbackVersion) reasons.push('ROLLBACK_VERSION_REQUIRED');
  if (candidate.status === 'ACTIVE' && candidate.canaryStatus !== 'PASSED') reasons.push('CANARY_MUST_PASS');
  if (candidate.clinical === true && candidate.clinicalSafetyReview !== 'APPROVED') reasons.push('CLINICAL_SAFETY_REVIEW_REQUIRED');
  return { ok: reasons.length === 0, reasons: reasons };
}
