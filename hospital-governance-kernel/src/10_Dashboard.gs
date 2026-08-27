/** Workspace operacional mobile-first; nenhuma decisão é executada no dashboard. */

var HKGK_DASHBOARD_QUEUE_LIMIT_ = 50;
var HKGK_DASHBOARD_FUTURE_TOLERANCE_SECONDS_ = 300;

function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('WMGJ Governance Kernel')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function hkgkInclude_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function HKGK_getDashboardSnapshot(filters) {
  var config = hkgkGetConfig_();
  filters = hkgkNormalizeDashboardFilters_(filters || {});
  var cache = hkgkDashboardCache_();
  var cacheKey = 'hkgk-dashboard-v3-' + (filters.status || 'ALL') + '-' + (filters.risk || 'ALL');
  if (cache) {
    var cached = cache.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (error) { /* Recalcula um cache inválido. */ }
    }
  }

  var outboxWindow = hkgkReadDashboardWindow_('HKGK_OUTBOX', 10000);
  var deadLetterWindow = hkgkReadDashboardWindow_('HKGK_DEAD_LETTERS', 1000);
  var runWindow = hkgkReadDashboardWindow_('HKGK_RUNS', 1000);
  var receiptWindow = hkgkReadDashboardWindow_('HKGK_RECEIPTS', 10000);
  var coverage = {
    outbox: hkgkDashboardCoverage_(outboxWindow),
    deadLetters: hkgkDashboardCoverage_(deadLetterWindow),
    runs: hkgkDashboardCoverage_(runWindow),
    receipts: hkgkDashboardCoverage_(receiptWindow)
  };
  var snapshot = hkgkDashboardSummaryPure_(
    outboxWindow.rows,
    deadLetterWindow.rows,
    runWindow.rows,
    receiptWindow.rows,
    new Date(),
    config.dashboardStaleSeconds,
    filters,
    coverage
  );
  if (cache) cache.put(cacheKey, JSON.stringify(snapshot), 30);
  return snapshot;
}

function hkgkDashboardCache_() {
  return typeof CacheService !== 'undefined' && CacheService.getScriptCache
    ? CacheService.getScriptCache()
    : null;
}

function hkgkReadDashboardWindow_(sheetName, limit) {
  var sheet = hkgkGetSheet_(sheetName);
  var availableRows = Math.max(0, sheet.getLastRow() - 1);
  var rows = hkgkReadObjects_(sheetName, limit);
  return {
    rows: rows,
    rowsRead: rows.length,
    availableRows: availableRows,
    isTruncated: availableRows > rows.length
  };
}

function hkgkDashboardCoverage_(window) {
  return {
    rowsRead: Number(window.rowsRead || 0),
    availableRows: Number(window.availableRows || 0),
    isTruncated: Boolean(window.isTruncated)
  };
}

function hkgkNormalizeDashboardFilters_(filters) {
  var statusAllowed = ['', 'READY', 'LEASED', 'RETRY_WAIT', 'DEAD_LETTER', 'UNKNOWN'];
  var riskAllowed = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'];
  var status = String(filters.status || '').toUpperCase();
  var risk = String(filters.risk || '').toUpperCase();
  return {
    status: statusAllowed.indexOf(status) >= 0 ? status : '',
    risk: riskAllowed.indexOf(risk) >= 0 ? risk : ''
  };
}

function hkgkDashboardSummaryPure_(outbox, deadLetters, runs, receipts, now, staleSeconds, filters, coverage) {
  outbox = outbox || [];
  deadLetters = deadLetters || [];
  runs = runs || [];
  receipts = receipts || [];
  now = now || new Date();
  staleSeconds = Math.max(1, Number(staleSeconds || 180));
  filters = hkgkNormalizeDashboardFilters_(filters || {});
  coverage = hkgkNormalizeDashboardCoverage_(coverage, outbox, deadLetters, runs, receipts);

  var statusCounts = { READY: 0, LEASED: 0, RETRY_WAIT: 0, SUCCEEDED: 0, DEAD_LETTER: 0, UNKNOWN: 0 };
  var riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, UNKNOWN: 0 };
  var invalidData = { eventJson: 0, risk: 0, status: 0, timestamps: 0, total: 0 };
  var alertQueue = [];

  outbox.forEach(function(job) {
    var dataIssueCode = '';
    var rawStatus = String(job.STATUS || '').toUpperCase();
    var status = Object.prototype.hasOwnProperty.call(statusCounts, rawStatus) ? rawStatus : 'UNKNOWN';
    if (status === 'UNKNOWN') {
      invalidData.status++;
      dataIssueCode = 'STATUS_UNKNOWN';
    }
    statusCounts[status]++;

    var event = null;
    try {
      event = JSON.parse(job.EVENT_JSON || '');
      if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('EVENT_JSON_INVALID');
    } catch (error) {
      event = {};
      invalidData.eventJson++;
      dataIssueCode = dataIssueCode || 'EVENT_JSON_INVALID';
    }
    var rawRisk = String(event.payload && event.payload.riskLevel || '').toUpperCase();
    var risk = Object.prototype.hasOwnProperty.call(riskCounts, rawRisk) ? rawRisk : 'UNKNOWN';
    if (risk === 'UNKNOWN') {
      invalidData.risk++;
      dataIssueCode = dataIssueCode || 'RISK_UNKNOWN';
    }
    riskCounts[risk]++;

    var rawUpdatedAt = job.UPDATED_AT || job.CREATED_AT || '';
    var updatedAt = hkgkDashboardValidTimestamp_(rawUpdatedAt, now);
    if (rawUpdatedAt && !updatedAt) {
      invalidData.timestamps++;
      dataIssueCode = dataIssueCode || 'TIMESTAMP_INVALID';
    }
    if (['READY', 'LEASED', 'RETRY_WAIT', 'DEAD_LETTER', 'UNKNOWN'].indexOf(status) >= 0) {
      alertQueue.push({
        id: job.JOB_ID || '',
        status: status,
        riskLevel: risk,
        entityType: event.aggregate && event.aggregate.type || 'unknown',
        updatedAt: updatedAt || '',
        traceId: job.TRACE_ID || '',
        errorCode: job.LAST_ERROR_CODE || dataIssueCode || ''
      });
    }
  });
  invalidData.total = invalidData.eventJson + invalidData.risk + invalidData.status + invalidData.timestamps;

  alertQueue.sort(function(a, b) {
    var rank = { UNKNOWN: 5, CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    var riskOrder = rank[b.riskLevel] - rank[a.riskLevel];
    if (riskOrder) return riskOrder;
    var aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    var bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return aTime - bTime;
  });

  var matchingQueue = alertQueue.filter(function(item) {
    return (!filters.status || item.status === filters.status) && (!filters.risk || item.riskLevel === filters.risk);
  });
  var componentSummary = hkgkDashboardComponents_(runs, now, staleSeconds, invalidData);
  invalidData.total = invalidData.eventJson + invalidData.risk + invalidData.status + invalidData.timestamps;
  var activeDeadLetters = statusCounts.DEAD_LETTER;
  var coveragePartial = Object.keys(coverage).some(function(key) { return coverage[key].isTruncated; });
  var healthStatus = componentSummary.hasError
    ? 'ERROR'
    : invalidData.total || activeDeadLetters
      ? 'DEGRADED'
      : coveragePartial || componentSummary.hasUnknown
        ? 'PARTIAL'
        : 'HEALTHY';
  var queueLimit = HKGK_DASHBOARD_QUEUE_LIMIT_;
  var queueMeta = {
    totalCandidates: alertQueue.length,
    totalMatches: matchingQueue.length,
    returned: Math.min(matchingQueue.length, queueLimit),
    limit: queueLimit,
    resultTruncated: matchingQueue.length > queueLimit,
    sourceTruncated: coverage.outbox.isTruncated,
    isTruncated: matchingQueue.length > queueLimit || coverage.outbox.isTruncated
  };

  return {
    insightTitle: 'Jobs operacionais pendentes, em retry e dead letter',
    generatedAt: now.toISOString(),
    lastUpdated: componentSummary.lastSuccessfulAt,
    sourceStatus: componentSummary.freshnessStatus,
    freshnessStatus: componentSummary.freshnessStatus,
    healthStatus: healthStatus,
    componentStatuses: componentSummary.components,
    updateCadenceSeconds: 60,
    statusCounts: statusCounts,
    riskCounts: riskCounts,
    invalidData: invalidData,
    dataCoverage: coverage,
    windowLabel: hkgkDashboardWindowLabel_(coverage),
    filters: filters,
    queueMeta: queueMeta,
    totals: {
      pending: statusCounts.READY + statusCounts.LEASED + statusCounts.RETRY_WAIT,
      deadLetters: deadLetters.length,
      receipts: receipts.length,
      successful: statusCounts.SUCCEEDED
    },
    metricDisplays: {
      pending: hkgkDashboardMetricDisplay_(statusCounts.READY + statusCounts.LEASED + statusCounts.RETRY_WAIT, coverage.outbox.isTruncated),
      deadLetters: hkgkDashboardMetricDisplay_(deadLetters.length, coverage.deadLetters.isTruncated),
      receipts: hkgkDashboardMetricDisplay_(receipts.length, coverage.receipts.isTruncated),
      successful: hkgkDashboardMetricDisplay_(statusCounts.SUCCEEDED, coverage.outbox.isTruncated)
    },
    alertQueue: matchingQueue.slice(0, queueLimit),
    caveat: 'Dashboard operacional em janela declarada. Valores com “≥” são limites inferiores; “INDISP.” evita apresentar zero quando a janela parcial não sustenta o total. Evidência e aprovação formal permanecem no backend canônico.'
  };
}

function hkgkDashboardComponents_(runs, now, staleSeconds, invalidData) {
  var definitions = [
    { id: 'SCAN_INBOX', label: 'Captura' },
    { id: 'DISPATCH_OUTBOX', label: 'Envio' },
    { id: 'WATCHDOG', label: 'Watchdog' }
  ];
  var records = {};
  definitions.forEach(function(definition) {
    records[definition.id] = { latest: null, latestSuccess: null };
  });
  runs.forEach(function(run) {
    var runType = String(run.RUN_TYPE || '').toUpperCase();
    if (!records[runType]) return;
    var rawTimestamp = run.FINISHED_AT || run.STARTED_AT || '';
    var timestamp = hkgkDashboardValidTimestamp_(rawTimestamp, now);
    if (!timestamp) {
      if (rawTimestamp) invalidData.timestamps++;
      return;
    }
    var item = {
      at: timestamp,
      millis: Date.parse(timestamp),
      status: String(run.STATUS || 'UNKNOWN').toUpperCase()
    };
    if (!records[runType].latest || item.millis > records[runType].latest.millis) records[runType].latest = item;
    if (item.status === 'SUCCEEDED' && (!records[runType].latestSuccess || item.millis > records[runType].latestSuccess.millis)) {
      records[runType].latestSuccess = item;
    }
  });

  var components = definitions.map(function(definition) {
    var record = records[definition.id];
    var lastSuccess = record.latestSuccess;
    var ageSeconds = lastSuccess ? Math.max(0, (now.getTime() - lastSuccess.millis) / 1000) : null;
    return {
      id: definition.id,
      label: definition.label,
      freshness: !lastSuccess ? 'OFFLINE' : ageSeconds > staleSeconds ? 'STALE' : 'LIVE',
      health: !record.latest ? 'UNKNOWN' : record.latest.status === 'FAILED' ? 'ERROR' : record.latest.status === 'SUCCEEDED' ? 'HEALTHY' : 'UNKNOWN',
      lastRunStatus: record.latest ? record.latest.status : 'UNKNOWN',
      lastRunAt: record.latest ? record.latest.at : '',
      lastSuccessAt: lastSuccess ? lastSuccess.at : '',
      ageSeconds: ageSeconds
    };
  });
  var liveCount = components.filter(function(component) { return component.freshness === 'LIVE'; }).length;
  var knownCount = components.filter(function(component) { return component.freshness !== 'OFFLINE'; }).length;
  var freshnessStatus = liveCount === components.length ? 'LIVE' : knownCount ? 'STALE' : 'OFFLINE';
  var successfulTimes = components.map(function(component) { return component.lastSuccessAt; }).filter(Boolean).sort();
  return {
    components: components,
    freshnessStatus: freshnessStatus,
    lastSuccessfulAt: successfulTimes.length ? successfulTimes[successfulTimes.length - 1] : '',
    hasError: components.some(function(component) { return component.health === 'ERROR'; }),
    hasUnknown: components.some(function(component) { return component.health === 'UNKNOWN'; })
  };
}

function hkgkDashboardValidTimestamp_(value, now) {
  if (!value) return '';
  var millis = Date.parse(String(value));
  if (!Number.isFinite(millis)) return '';
  if (millis > now.getTime() + HKGK_DASHBOARD_FUTURE_TOLERANCE_SECONDS_ * 1000) return '';
  return new Date(millis).toISOString();
}

function hkgkNormalizeDashboardCoverage_(coverage, outbox, deadLetters, runs, receipts) {
  coverage = coverage || {};
  return {
    outbox: hkgkNormalizeDashboardCoverageEntry_(coverage.outbox, outbox.length),
    deadLetters: hkgkNormalizeDashboardCoverageEntry_(coverage.deadLetters, deadLetters.length),
    runs: hkgkNormalizeDashboardCoverageEntry_(coverage.runs, runs.length),
    receipts: hkgkNormalizeDashboardCoverageEntry_(coverage.receipts, receipts.length)
  };
}

function hkgkNormalizeDashboardCoverageEntry_(entry, fallbackLength) {
  entry = entry || {};
  var rowsRead = Math.max(0, Number(Object.prototype.hasOwnProperty.call(entry, 'rowsRead') ? entry.rowsRead : fallbackLength));
  var availableRows = Math.max(rowsRead, Number(Object.prototype.hasOwnProperty.call(entry, 'availableRows') ? entry.availableRows : fallbackLength));
  return {
    rowsRead: rowsRead,
    availableRows: availableRows,
    isTruncated: Boolean(entry.isTruncated || availableRows > rowsRead)
  };
}

function hkgkDashboardWindowLabel_(coverage) {
  var labels = [
    ['Outbox', coverage.outbox],
    ['Dead letters', coverage.deadLetters],
    ['Execuções', coverage.runs],
    ['Recibos', coverage.receipts]
  ];
  return 'Janela lida — ' + labels.map(function(item) {
    return item[0] + ': ' + item[1].rowsRead + '/' + item[1].availableRows + (item[1].isTruncated ? ' (parcial)' : ' (completa)');
  }).join(' · ');
}

function hkgkDashboardMetricDisplay_(value, truncated) {
  var numericValue = Number(value || 0);
  if (truncated && numericValue === 0) return 'INDISP.';
  return (truncated ? '≥' : '') + String(numericValue);
}
