/** Máquinas de estado, aprovação, segurança clínica e retry. */

function hkgkDocumentTransitions_() {
  return {
    RECEIVED: ['CLASSIFIED', 'BLOCKED', 'CANCELLED'],
    CLASSIFIED: ['EXTRACTED', 'BLOCKED', 'CANCELLED'],
    EXTRACTED: ['NORMALIZED', 'BLOCKED', 'CANCELLED'],
    NORMALIZED: ['PENDING_EVIDENCE', 'PENDING_HUMAN_REVIEW', 'BLOCKED', 'CANCELLED'],
    PENDING_EVIDENCE: ['PENDING_HUMAN_REVIEW', 'BLOCKED', 'CANCELLED'],
    PENDING_HUMAN_REVIEW: ['VALIDATED', 'BLOCKED', 'CANCELLED'],
    VALIDATED: ['CLOSED', 'BLOCKED'],
    BLOCKED: ['RECEIVED', 'CLASSIFIED', 'EXTRACTED', 'NORMALIZED', 'PENDING_EVIDENCE', 'PENDING_HUMAN_REVIEW'],
    CANCELLED: [],
    CLOSED: []
  };
}

function hkgkCanTransition_(fromState, toState) {
  var transitions = hkgkDocumentTransitions_();
  return Boolean(transitions[fromState] && transitions[fromState].indexOf(toState) >= 0);
}

function hkgkAssessTransition_(command, snapshot, findings, approvals) {
  command = command || {};
  snapshot = snapshot || {};
  findings = findings || [];
  approvals = approvals || [];
  var reasons = [];
  if (!hkgkCanTransition_(snapshot.workflowState, command.toState)) reasons.push('TRANSITION_NOT_ALLOWED');
  if (!Number.isInteger(command.expectedVersion) || !Number.isInteger(snapshot.version)) {
    reasons.push('EXPECTED_VERSION_REQUIRED');
  } else if (command.expectedVersion !== snapshot.version) reasons.push('VERSION_CONFLICT');
  if (!command.reasonCode) reasons.push('REASON_REQUIRED');
  if (!command.snapshotHash || !snapshot.snapshotHash) reasons.push('SNAPSHOT_HASH_REQUIRED');
  else if (command.snapshotHash !== snapshot.snapshotHash) reasons.push('SNAPSHOT_CHANGED');
  if (command.toState === 'VALIDATED' || command.toState === 'CLOSED') {
    var closure = hkgkClosureGate_(snapshot, findings, approvals, command.toState === 'CLOSED');
    reasons = reasons.concat(closure.reasons);
  }
  return { ok: reasons.length === 0, reasons: reasons };
}

function hkgkApprovalPolicy_(action, context) {
  context = context || {};
  var criticalAction = [
    'CLINICAL_CONCLUSION', 'FINANCIAL_CLOSURE', 'CONTRACT_DECISION', 'GLOSS_APPEAL_FINAL',
    'OPME_FINAL', 'EXECUTIVE_REPORT_FINAL', 'CLOSE_CASE'
  ].indexOf(action) >= 0;
  var highRisk = ['HIGH', 'CRITICAL'].indexOf(String(context.riskLevel || 'MEDIUM').toUpperCase()) >= 0;
  return {
    required: criticalAction || highRisk || Boolean(context.clinical),
    requiredRoles: context.clinical ? ['medical_auditor'] : ['auditor', 'manager'],
    quorum: context.clinical && highRisk ? 2 : 1,
    separationOfDuties: criticalAction || highRisk,
    expiresInSeconds: highRisk ? 86400 : 259200
  };
}

function hkgkClosureGate_(snapshot, findings, approvals, finalClose, now) {
  var reasons = [];
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  var openFindings = findings.filter(function(item) {
    return ['RESOLVED', 'CLOSED', 'WAIVED', 'CANCELLED'].indexOf(
      String(item.status || 'OPEN').toUpperCase()
    ) < 0;
  });
  var criticalOpen = openFindings.some(function(item) {
    return ['HIGH', 'CRITICAL'].indexOf(String(item.severity || item.riskLevel || '').toUpperCase()) >= 0;
  });
  var policy = hkgkApprovalPolicy_(finalClose ? 'CLOSE_CASE' : 'VALIDATE_CASE', snapshot);
  var expectedAction = finalClose ? 'CLOSE_CASE' : 'VALIDATE_CASE';
  var matchingApprovals = approvals.filter(function(item) {
    return item && item.status === 'APPROVED' && item.snapshotHash === snapshot.snapshotHash &&
      typeof item.approverId === 'string' && item.approverId.trim() !== '';
  });
  var validApprovals = matchingApprovals.filter(function(item) {
    var expiresAt = Date.parse(String(item.expiresAt || ''));
    var roles = Array.isArray(item.roles) ? item.roles : [];
    var roleAllowed = roles.some(function(role) { return policy.requiredRoles.indexOf(role) >= 0; });
    var sameOrg = !snapshot.orgId || item.orgId === snapshot.orgId;
    return item.identityVerified === true && item.source === 'BACKEND_AUTH' && item.actorType === 'USER' &&
      item.action === expectedAction && Number.isFinite(expiresAt) && expiresAt > nowMs && roleAllowed && sameOrg;
  });
  var distinctApprovers = {};
  validApprovals.forEach(function(item) { distinctApprovers[item.approverId] = true; });
  if (!Array.isArray(snapshot.evidenceRefs) || snapshot.evidenceRefs.length === 0) reasons.push('EVIDENCE_REQUIRED');
  if (!snapshot.snapshotHash) reasons.push('SNAPSHOT_HASH_REQUIRED');
  if (policy.required && (!snapshot.orgId || !snapshot.requestedBy)) reasons.push('APPROVAL_CONTEXT_REQUIRED');
  if (openFindings.length > 0) reasons.push('OPEN_FINDING_REQUIRES_DISPOSITION');
  if (criticalOpen) reasons.push('CRITICAL_FINDING_OPEN');
  if (policy.required && Object.keys(distinctApprovers).length < policy.quorum) reasons.push('APPROVAL_QUORUM_NOT_MET');
  if (policy.separationOfDuties && matchingApprovals.some(function(item) {
    return item.approverId === snapshot.requestedBy;
  })) reasons.push('SEPARATION_OF_DUTIES_VIOLATION');
  if (finalClose && snapshot.reconciliationStatus !== 'MATCHED') reasons.push('RECONCILIATION_REQUIRED');
  return { ok: reasons.length === 0, reasons: reasons, policy: policy };
}

function hkgkClinicalSafety_(event, config) {
  var reasons = [];
  var clinical = Boolean(
    event.classification && (
      event.classification.clinical || event.classification.sensitivity === 'CLINICAL_SENSITIVE'
    )
  );
  if (clinical && config.clinicalMode === 'disabled') reasons.push('CLINICAL_MODE_DISABLED');
  if (clinical && config.env === 'staging' && config.clinicalMode !== 'synthetic') reasons.push('REAL_CLINICAL_DATA_FORBIDDEN_IN_STAGING');
  if (clinical && (
    hkgkFindDirectIdentifiers_(event.payload || {}).length > 0 ||
    hkgkContainsDirectIdentifierValue_(event.payload || {})
  )) reasons.push('DIRECT_IDENTIFIER_FORBIDDEN');
  var automatedDecision = event.payload && event.payload.requestedDecision;
  if (automatedDecision && [
    'DIAGNOSIS', 'PRESCRIPTION', 'COVERAGE_DENIAL', 'CLINICAL_FINAL', 'PAYMENT', 'FINAL_CLOSURE'
  ].indexOf(String(automatedDecision).toUpperCase()) >= 0) reasons.push('AUTOMATED_CRITICAL_DECISION_FORBIDDEN');
  return { ok: reasons.length === 0, reasons: reasons, clinical: clinical };
}

function hkgkRetryDecision_(errorCode, attempt, maxAttempts, seed, retryableOverride) {
  var retryable = typeof retryableOverride === 'boolean'
    ? retryableOverride
    : /^(TIMEOUT|NETWORK|HTTP_429|HTTP_5\d\d|LEASE_EXPIRED|LOCAL_LOCK_UNAVAILABLE|AMBIGUOUS_BACKEND_RECEIPT|INVALID_JSON_RESPONSE)$/.test(
      String(errorCode || '')
    );
  if (!retryable || attempt >= maxAttempts) return { action: 'DEAD_LETTER', delayMs: 0 };
  var base = Math.min(300000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));
  var stableSeed = Number(seed || 0) % 1000;
  var jitter = Math.floor(base * 0.2 * (stableSeed / 1000));
  return { action: 'RETRY_WAIT', delayMs: base + jitter };
}
