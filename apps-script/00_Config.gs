const WMGJ_CONFIG = {
  spreadsheetId: '15LgI2U2dtM7vnrxFsiQMPTvBapBDg5ftgGttx7Pw0Cw',
  timezone: 'America/Sao_Paulo',
  sheets: {
    dashboard: '05_DASHBOARD',
    log: '10_LOG_AUTOMACAO',
    extratoClassificado: '02_EXTRATO_CLASSIFICADO',
    financeiroMensal: '05_FINANCEIRO_MENSAL',
    producaoMedica: '08_PRODUCAO_MEDICA',
    nfsRepasses: '09_NFS_REPASSES',
    conciliacaoCompleta: '10_CONCILIACAO_COMPLETA',
    pendenciasConciliacao: '11_PENDENCIAS_CONCILIACAO'
  }
};

function getPlanilhaWMGJ() {
  return SpreadsheetApp.openById(WMGJ_CONFIG.spreadsheetId);
}

function nowWMGJ_() {
  return Utilities.formatDate(new Date(), WMGJ_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss');
}
