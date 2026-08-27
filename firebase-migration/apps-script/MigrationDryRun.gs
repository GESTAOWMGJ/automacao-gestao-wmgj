/**
 * Backfill incremental WMGJ → Firestore.
 * Não apaga, não reordena e não altera linhas da planilha.
 * Checkpoint só avança quando DRY_RUN=false e o endpoint aceita/identifica duplicata.
 */

var WMGJ_FIRESTORE_MIGRATION_VERSION = 'v1.0.0-backfill-checkpoint';

function wmgjFirestoreMigrationMap_() {
  return {
    '01_CADASTRO_ARQUIVOS': { entityType: 'sourceDocument', sensitivity: 'RESTRICTED' },
    '02_PRODUTIVIDADE_MENSAL': { entityType: 'productivityRecord', sensitivity: 'RESTRICTED' },
    '03_PRODUTIVIDADE_MEDICO': { entityType: 'productivityRecord', sensitivity: 'RESTRICTED' },
    '04_CENTRO_CUSTOS': { entityType: 'financialEntry', sensitivity: 'RESTRICTED' },
    '05_FINANCEIRO_MENSAL': { entityType: 'financialEntry', sensitivity: 'RESTRICTED' },
    '06_NFS_E': { entityType: 'invoice', sensitivity: 'RESTRICTED' },
    '07_ESCALA': { entityType: 'shift', sensitivity: 'RESTRICTED' },
    '07_IMPOSTOS': { entityType: 'taxObligation', sensitivity: 'RESTRICTED' },
    '08_EXTRATOS_BRADESCO': { entityType: 'bankTransaction', sensitivity: 'RESTRICTED' },
    '08_CONTRATOS_E_ATAS': { entityType: 'contract', sensitivity: 'RESTRICTED' },
    '13_CONTROLE_PIPELINE': { entityType: 'runtimeCheckpoint', sensitivity: 'INTERNAL' },
    '14_MEMORIA_BASE_DOCUMENTOS': { entityType: 'sourceDocument', sensitivity: 'RESTRICTED' },
    '15_FILA_PROCESSAMENTO': { entityType: 'runtimeCheckpoint', sensitivity: 'INTERNAL' },
    '21_GMAIL_INDEXACAO_FATURAMENTO': { entityType: 'sourceDocument', sensitivity: 'RESTRICTED' },
    '42_CHECKPOINT_OPERACIONAL': { entityType: 'runtimeCheckpoint', sensitivity: 'INTERNAL' }
  };
}

function wmgjFirestoreMigracaoDryRun(limitPerSheet) {
  var cfg = wmgjFirestoreConfig_();
  var ss = getPlanilha();
  var mapping = wmgjFirestoreMigrationMap_();
  var limit = Math.max(1, Math.min(Number(limitPerSheet || cfg.maxRows), cfg.maxRows));
  var result = {
    ok: true,
    version: WMGJ_FIRESTORE_MIGRATION_VERSION,
    dryRun: cfg.dryRun,
    sheets: {},
    startedAt: new Date().toISOString()
  };

  Object.keys(mapping).forEach(function(sheetName) {
    result.sheets[sheetName] = wmgjFirestoreMigrarAba_(ss, sheetName, mapping[sheetName], limit, cfg);
    if (result.sheets[sheetName].errors > 0) result.ok = false;
  });

  result.finishedAt = new Date().toISOString();
  wmgjFirestoreLog_('MIGRATION_RUN', result.ok ? 'OK' : 'ALERTA', result);
  return result;
}

function wmgjFirestoreMigrarAba_(ss, sheetName, config, limit, bridgeConfig) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return { ok: true, skipped: true, reason: 'ABA_AUSENTE_OU_VAZIA', sent: 0, errors: 0 };
  }

  var props = PropertiesService.getScriptProperties();
  var checkpointKey = 'WMGJ_FS_MIG_' + sheetName + '_ROW';
  var startRow = Math.max(2, Number(props.getProperty(checkpointKey) || 2));
  var lastRow = sheet.getLastRow();
  var rowsToRead = Math.min(limit, lastRow - startRow + 1);
  if (rowsToRead <= 0) return { ok: true, complete: true, sent: 0, errors: 0, lastRow: lastRow };

  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  var values = sheet.getRange(startRow, 1, rowsToRead, width).getDisplayValues();
  var sent = 0;
  var duplicates = 0;
  var errors = 0;
  var planned = 0;
  var lastAcceptedRow = startRow - 1;

  values.forEach(function(row, offset) {
    var rowNumber = startRow + offset;
    if (row.join('').trim() === '') return;

    var record = wmgjFirestoreRowObject_(headers, row);
    var rowHash = wmgjFirestoreHashString_(JSON.stringify(record));
    var entityKey = wmgjFirestoreEntityKey_(sheetName, record, rowNumber, rowHash);
    var legacyStatus = String(record.status || record.status_processamento || record.status_auditoria || '');
    var workflow = wmgjFirestoreWorkflowFromLegacy_(legacyStatus);
    var event = {
      schemaVersion: 1,
      eventId: Utilities.getUuid(),
      eventType: 'ENTITY_UPSERT',
      orgId: bridgeConfig.orgId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: [bridgeConfig.orgId, 'SHEETS', ss.getId(), sheetName, rowNumber, rowHash].join(':'),
      entityType: config.entityType,
      entityKey: entityKey,
      expectedVersion: 0,
      actor: {
        type: 'SYSTEM',
        id: Session.getEffectiveUser().getEmail() || 'apps-script',
        source: 'WMGJ_SHEETS_BACKFILL'
      },
      source: {
        system: 'SHEETS',
        sourceId: [ss.getId(), sheetName, rowNumber].join(':'),
        parentId: ss.getId(),
        fileName: sheetName + '!A' + rowNumber,
        contentHash: rowHash,
        hashMethod: 'row_sha256'
      },
      workflowState: workflow.state,
      reviewState: workflow.review,
      riskLevel: workflow.risk,
      sensitivity: config.sensitivity,
      competence: wmgjFirestoreFindCompetence_(record),
      documentType: sheetName,
      record: record,
      metadata: {
        migrationVersion: WMGJ_FIRESTORE_MIGRATION_VERSION,
        sourceSheet: sheetName,
        sourceRow: rowNumber,
        nonDestructive: true
      }
    };

    try {
      var response = wmgjFirestoreEnviarEvento_(event);
      planned++;
      if (bridgeConfig.dryRun) return;
      if (response.accepted) sent++;
      if (response.duplicate) duplicates++;
      if (response.ok && (response.accepted || response.duplicate)) lastAcceptedRow = rowNumber;
    } catch (error) {
      errors++;
      wmgjFirestoreLog_('MIGRATION_ROW', 'ERRO', {
        sheet: sheetName,
        row: rowNumber,
        error: error && error.message ? error.message : String(error)
      });
    }
  });

  if (!bridgeConfig.dryRun && lastAcceptedRow >= startRow && errors === 0) {
    props.setProperty(checkpointKey, String(lastAcceptedRow + 1));
  }

  return {
    ok: errors === 0,
    dryRun: bridgeConfig.dryRun,
    startRow: startRow,
    rowsRead: values.length,
    planned: planned,
    sent: sent,
    duplicates: duplicates,
    errors: errors,
    nextRow: bridgeConfig.dryRun ? startRow : Number(props.getProperty(checkpointKey) || startRow)
  };
}

function wmgjFirestoreRowObject_(headers, row) {
  var output = {};
  headers.forEach(function(header, index) {
    var key = wmgjFirestoreNormalizeHeader_(header, index);
    var value = row[index];
    if (value !== '') output[key] = String(value).slice(0, 10000);
  });
  return output;
}

function wmgjFirestoreNormalizeHeader_(header, index) {
  var key = String(header || 'col_' + (index + 1))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'col_' + (index + 1);
}

function wmgjFirestoreEntityKey_(sheetName, record, rowNumber, hash) {
  var candidates = [
    record.chave_acesso,
    record.numero_nf,
    record.id_operacao,
    record.id_origem,
    record.message_id,
    record.id_drive,
    record.competencia_assistencial,
    record.competencia,
    record.data_registro
  ].filter(function(value) { return Boolean(value); });
  return [sheetName].concat(candidates.slice(0, 4)).concat([hash.slice(0, 16)]).join(':') || sheetName + ':' + rowNumber;
}

function wmgjFirestoreFindCompetence_(record) {
  var fields = [
    record.competencia_assistencial,
    record.competencia_faturamento,
    record.competencia_nfs_e,
    record.competencia,
    record.competencia_contabil
  ];
  for (var i = 0; i < fields.length; i++) {
    var normalized = wmgjFirestoreCompetencia_(fields[i]);
    if (normalized) return normalized;
  }
  return '';
}

function wmgjFirestoreWorkflowFromLegacy_(status) {
  var s = String(status || '').toUpperCase();
  if (s.indexOf('BLOQUE') >= 0) return { state: 'BLOCKED', review: 'PENDING', risk: 'CRITICAL' };
  if (s.indexOf('ERRO') >= 0 || s.indexOf('REJEIT') >= 0) return { state: 'FAILED', review: 'PENDING', risk: 'HIGH' };
  if (s.indexOf('PENDENTE') >= 0 || s.indexOf('REVIS') >= 0 || s.indexOf('HUMAN') >= 0) return { state: 'PENDING_HUMAN_REVIEW', review: 'PENDING', risk: 'MEDIUM' };
  if (s.indexOf('VALID') >= 0 || s.indexOf('PROCESSADO') >= 0 || s.indexOf('CONCLUID') >= 0 || s === 'OK') return { state: 'VALIDATED', review: 'NOT_REQUIRED', risk: 'LOW' };
  return { state: 'RECEIVED', review: 'PENDING', risk: 'MEDIUM' };
}
