/** Setup manual, fixtures sintéticas e diagnóstico. */

function HKGK_setupStaging() {
  var props = PropertiesService.getScriptProperties();
  var existingId = String(props.getProperty('HKGK_DATA_SPREADSHEET_ID') || '');
  if (existingId) {
    var existingMarker = String(props.getProperty('HKGK_DATA_SPREADSHEET_MARKER') || '');
    if (!existingMarker) throw hkgkError_('SPREADSHEET_MARKER_MISSING', existingId, '', false);
    var existing = SpreadsheetApp.openById(existingId);
    hkgkVerifySpreadsheetMarker_(existing, existingMarker);
    hkgkEnsureSheets_(existing);
    return { created: false, spreadsheetId: existingId, url: existing.getUrl() };
  }
  var spreadsheet = SpreadsheetApp.create('WMGJ_HOSPITAL_GOVERNANCE_KERNEL_HML');
  var marker = 'hkgk-' + hkgkUuid_();
  hkgkInitializeSpreadsheetMarker_(spreadsheet, marker);
  hkgkEnsureSheets_(spreadsheet);
  props.setProperties({
    HKGK_ENV: 'staging',
    HKGK_ORG_ID: 'wmgj-sandbox',
    HKGK_DRY_RUN: 'true',
    HKGK_KILL_SWITCH: 'true',
    HKGK_KILL_SWITCH_MODE: 'ALL',
    HKGK_TRANSPORT_APPROVED: 'false',
    HKGK_CLINICAL_MODE: 'disabled',
    HKGK_DATA_SPREADSHEET_ID: spreadsheet.getId(),
    HKGK_DATA_SPREADSHEET_MARKER: marker
  }, false);
  return { created: true, spreadsheetId: spreadsheet.getId(), url: spreadsheet.getUrl() };
}

function hkgkInitializeSpreadsheetMarker_(spreadsheet, marker) {
  if (!spreadsheet || !marker) throw hkgkError_('SPREADSHEET_MARKER_INIT_INVALID', '', '', false);
  var sheet = spreadsheet.getSheetByName('HKGK_META') || spreadsheet.insertSheet('HKGK_META');
  if (sheet.getLastRow() > 0 || sheet.getLastColumn() > 0) {
    throw hkgkError_('SPREADSHEET_MARKER_SHEET_NOT_EMPTY', spreadsheet.getId(), '', false);
  }
  sheet.getRange(1, 1, 2, 4).setValues([
    hkgkTableDefinitions_().HKGK_META,
    ['HKGK_WORKBOOK_MARKER_V1', marker, spreadsheet.getId(), hkgkNowIso_()]
  ]);
  SpreadsheetApp.flush();
}

function hkgkVerifySpreadsheetMarker_(spreadsheet, expectedMarker) {
  if (!spreadsheet || spreadsheet.getId() === '' || !expectedMarker) {
    throw hkgkError_('SPREADSHEET_MARKER_INVALID', '', '', false);
  }
  var sheet = spreadsheet.getSheetByName('HKGK_META');
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 4) {
    throw hkgkError_('SPREADSHEET_MARKER_NOT_FOUND', spreadsheet.getId(), '', false);
  }
  var values = sheet.getRange(1, 1, 2, 4).getDisplayValues();
  var expectedHeaders = hkgkTableDefinitions_().HKGK_META;
  if (values[0].join('|') !== expectedHeaders.join('|') ||
      values[1][0] !== 'HKGK_WORKBOOK_MARKER_V1' ||
      values[1][1] !== expectedMarker || values[1][2] !== spreadsheet.getId()) {
    throw hkgkError_('SPREADSHEET_MARKER_MISMATCH', spreadsheet.getId(), '', false);
  }
  return true;
}

function hkgkEnsureSheets_(spreadsheet) {
  var definitions = hkgkTableDefinitions_();
  Object.keys(definitions).forEach(function(sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    var headers = definitions[sheetName];
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    else {
      var current = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0];
      headers.forEach(function(header, index) {
        if (current[index] && current[index] !== header) {
          throw hkgkError_('SCHEMA_DRIFT', sheetName + ':' + (index + 1), '', false);
        }
      });
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#123f48').setFontColor('#ffffff');
  });
  var defaultSheet = spreadsheet.getSheetByName('Sheet1') || spreadsheet.getSheetByName('Página1');
  if (defaultSheet && Object.keys(definitions).indexOf(defaultSheet.getName()) < 0) spreadsheet.deleteSheet(defaultSheet);
  var metaSheet = spreadsheet.getSheetByName('HKGK_META');
  if (metaSheet && !metaSheet.isSheetHidden()) metaSheet.hideSheet();
  SpreadsheetApp.flush();
}

function HKGK_generateSyntheticFixtures() {
  var config = hkgkGetConfig_();
  hkgkAssertRunnable_(config, 'SCAN');
  if (config.env !== 'staging' || config.orgId !== 'wmgj-sandbox' || config.clinicalMode !== 'disabled') {
    throw hkgkError_('SYNTHETIC_FIXTURE_GATE_FAILED', '', '', false);
  }
  var now = hkgkNowIso_();
  var fixtureId = 'synthetic-case-' + hkgkUuid_().slice(0, 8);
  hkgkAppendObject_('HKGK_INBOX', {
    SOURCE_SYSTEM: 'SYNTHETIC',
    SOURCE_ID: fixtureId,
    SOURCE_VERSION: '1',
    ENTITY_TYPE: 'governanceCase',
    FACILITY_ID: 'sandbox-facility',
    SENSITIVITY: 'INTERNAL',
    EVIDENCE_REFS_JSON: JSON.stringify(['synthetic://evidence/invoice-001']),
    PAYLOAD_JSON: JSON.stringify({
      workflowState: 'RECEIVED', reviewState: 'PENDING', riskLevel: 'HIGH',
      competence: '2026-08', documentType: 'SYNTHETIC_INVOICE', billedAmount: 1000,
      authorizedAmount: 900, reconciliationStatus: 'PENDING', synthetic: true
    }),
    STATUS: 'NEW',
    ATTEMPTS: '0',
    LAST_ERROR_CODE: '',
    TRACE_ID: '',
    CREATED_AT: now,
    UPDATED_AT: now,
    NEXT_ATTEMPT_AT: '',
    EXPECTED_VERSION: '0'
  });
  return { ok: true, fixtureId: fixtureId, createdAt: now };
}

function HKGK_diagnostics() {
  var config = hkgkGetConfig_();
  var validation = hkgkValidateConfig_(config);
  var sheets = {};
  if (config.dataSpreadsheetId) {
    var spreadsheet = SpreadsheetApp.openById(config.dataSpreadsheetId);
    hkgkVerifySpreadsheetMarker_(spreadsheet, config.dataSpreadsheetMarker);
    Object.keys(hkgkTableDefinitions_()).forEach(function(name) {
      var sheet = spreadsheet.getSheetByName(name);
      sheets[name] = Boolean(sheet) && hkgkHeaders_(sheet).join('|') === hkgkTableDefinitions_()[name].join('|');
    });
  }
  return {
    ok: validation.ok && Object.keys(sheets).every(function(name) { return sheets[name]; }),
    version: HKGK_VERSION,
    env: config.env,
    orgId: config.orgId,
    dryRun: config.dryRun,
    killSwitch: config.killSwitch,
    pauseMode: config.pauseMode,
    transportApproved: config.transportApproved,
    clinicalMode: config.clinicalMode,
    ingestConfigured: Boolean(config.ingestUrl),
    secretConfigured: config.ingestSecret.length >= 32,
    dataSpreadsheetConfigured: Boolean(config.dataSpreadsheetId),
    sheets: sheets,
    errors: validation.errors,
    warnings: validation.warnings,
    checkedAt: hkgkNowIso_()
  };
}

function HKGK_pause(reason, mode) {
  if (!String(reason || '').trim()) throw hkgkError_('REASON_REQUIRED', '', '', false);
  mode = String(mode || 'ALL').toUpperCase();
  if (['ALL', 'DISPATCH'].indexOf(mode) < 0) throw hkgkError_('KILL_SWITCH_MODE_INVALID', mode, '', false);
  PropertiesService.getScriptProperties().setProperties({
    HKGK_KILL_SWITCH: 'true',
    HKGK_KILL_SWITCH_MODE: mode
  }, false);
  return { paused: true, mode: mode, reason: hkgkSanitizeErrorDetail_(reason), at: hkgkNowIso_() };
}

function HKGK_resume(reason) {
  var config = hkgkGetConfig_();
  if (!String(reason || '').trim()) throw hkgkError_('REASON_REQUIRED', '', '', false);
  var validation = hkgkValidateConfig_(config);
  if (!validation.ok) throw hkgkError_('CONFIG_INVALID', validation.errors.join(','), '', false);
  if (config.env === 'staging' && config.clinicalMode !== 'disabled') {
    throw hkgkError_('STAGING_RESUME_GATE_FAILED', '', '', false);
  }
  PropertiesService.getScriptProperties().setProperty('HKGK_KILL_SWITCH', 'false');
  PropertiesService.getScriptProperties().setProperty('HKGK_KILL_SWITCH_MODE', 'NONE');
  return { resumed: true, reason: hkgkSanitizeErrorDetail_(reason), at: hkgkNowIso_() };
}
