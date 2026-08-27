/** Repositório local transitório; nunca é a trilha canônica de auditoria. */

function hkgkGetSpreadsheet_() {
  var config = hkgkGetConfig_();
  if (!config.dataSpreadsheetId) throw hkgkError_('DATA_SPREADSHEET_NOT_CONFIGURED', '', '', false);
  if (!config.dataSpreadsheetMarker) throw hkgkError_('DATA_SPREADSHEET_MARKER_REQUIRED', '', '', false);
  var spreadsheet = SpreadsheetApp.openById(config.dataSpreadsheetId);
  hkgkVerifySpreadsheetMarker_(spreadsheet, config.dataSpreadsheetMarker);
  return spreadsheet;
}

function hkgkGetSheet_(sheetName) {
  var definitions = hkgkTableDefinitions_();
  if (!definitions[sheetName]) throw hkgkError_('SHEET_NOT_ALLOWLISTED', sheetName, '', false);
  var sheet = hkgkGetSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw hkgkError_('SHEET_MISSING', sheetName, '', false);
  return sheet;
}

function hkgkHeaders_(sheet) {
  if (sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
}

function hkgkAppendObject_(sheetName, record) {
  var sheet = hkgkGetSheet_(sheetName);
  var headers = hkgkHeaders_(sheet);
  if (!headers.length) throw hkgkError_('SHEET_HEADERS_MISSING', sheetName, '', false);
  var sanitized = hkgkSanitizePayload_(record || {});
  var values = headers.map(function(header) {
    var value = Object.prototype.hasOwnProperty.call(sanitized, header) ? sanitized[header] : '';
    return hkgkSerializeCellValue_(value, sheetName + '.' + header);
  });
  sheet.appendRow(values);
  SpreadsheetApp.flush();
  return sheet.getLastRow();
}

function hkgkReadObjects_(sheetName, limit) {
  var sheet = hkgkGetSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  var count = Math.min(Math.max(1, Number(limit || lastRow - 1)), lastRow - 1);
  var startRow = Math.max(2, lastRow - count + 1);
  var values = sheet.getRange(startRow, 1, count, lastColumn).getDisplayValues();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  return values.map(function(row, offset) {
    var record = { __rowNumber: startRow + offset };
    headers.forEach(function(header, index) { record[header] = row[index]; });
    return record;
  });
}

function hkgkFindBy_(sheetName, field, value, limit) {
  return hkgkReadObjects_(sheetName, limit || 5000).filter(function(record) {
    return String(record[field]) === String(value);
  });
}

function hkgkUpdateRow_(sheetName, rowNumber, changes) {
  var sheet = hkgkGetSheet_(sheetName);
  var headers = hkgkHeaders_(sheet);
  if (rowNumber < 2 || rowNumber > sheet.getLastRow()) throw hkgkError_('ROW_OUT_OF_RANGE', sheetName, '', false);
  var current = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
  var sanitized = hkgkSanitizePayload_(changes || {});
  headers.forEach(function(header, index) {
    if (!Object.prototype.hasOwnProperty.call(sanitized, header)) return;
    var value = sanitized[header];
    current[index] = hkgkSerializeCellValue_(value, sheetName + '.' + header);
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
  SpreadsheetApp.flush();
}

function hkgkSerializeCellValue_(value, field) {
  var serialized;
  try {
    serialized = value && typeof value === 'object'
      ? JSON.stringify(value)
      : String(value === null || typeof value === 'undefined' ? '' : value);
  } catch (error) {
    throw hkgkError_('CELL_VALUE_NOT_SERIALIZABLE', field, '', false);
  }
  if (serialized.length > HKGK_MAX_CELL_CHARS) {
    throw hkgkError_('CELL_VALUE_TOO_LARGE', field + ':' + serialized.length, '', false);
  }
  return serialized;
}

function hkgkWithScriptLock_(timeoutMs, callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(Math.max(1000, Number(timeoutMs || 5000)))) {
    throw hkgkError_('LOCAL_LOCK_UNAVAILABLE', '', '', true);
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
