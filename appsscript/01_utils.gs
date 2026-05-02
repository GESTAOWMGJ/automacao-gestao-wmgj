function getOrCreateSheetWMGJ(nome, cabecalho) {
  const ss = getPlanilha();
  let sheet = ss.getSheetByName(nome);
  if (!sheet) sheet = ss.insertSheet(nome);
  if (cabecalho && sheet.getLastRow() === 0) sheet.appendRow(cabecalho);
  return sheet;
}

function registrarLogWMGJ(evento, status, detalhes) {
  const sheet = getOrCreateSheetWMGJ(WMGJ_CONFIG.SHEETS.LOG, [
    'DATA_HORA', 'EVENTO', 'STATUS', 'DETALHES'
  ]);
  sheet.appendRow([new Date(), evento || '', status || '', detalhes || '']);
}

function testarExecucaoWMGJ(payload) {
  registrarLogWMGJ(
    'TESTE_EXECUCAO',
    'TESTE_OK',
    JSON.stringify(payload || {})
  );

  return {
    ok: true,
    comando: payload && payload.comando,
    status: 'TESTE_OK',
    mensagem: 'Webhook, Apps Script e Sheets responderam corretamente',
    escrita: WMGJ_CONFIG.SHEETS.LOG
  };
}

function normalizarTextoWMGJ(texto) {
  return String(texto || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extrairCompetenciaWMGJ(data) {
  if (!data) return '';
  const d = new Date(data);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  const texto = String(data);
  const match = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return match[3] + '-' + match[2];
  return '';
}
