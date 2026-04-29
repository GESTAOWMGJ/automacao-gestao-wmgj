const CONFIG = {
  SPREADSHEET_ID: "15LgI2U2dtM7vnrxFsiQMPTvBapBDg5ftgGttx7Pw0Cw",
  PASTA_RAIZ_ID: "1womnmIbaNQ8qkNlnkS2Ni71LVwtdrNj5",
  PASTA_ENTRADA_ID: "1Gz0GtUfvKezI8OmAH0h8fkNLlqEzfYU-",
  SHEETS: {
    CADASTRO: "01_CADASTRO_ARQUIVOS",
    PRODUTIVIDADE: "02_PRODUTIVIDADE_MENSAL",
    FINANCEIRO: "05_FINANCEIRO_MENSAL",
    NFSE: "06_NFS_E",
    DASHBOARD: "09_INDICADORES_DASHBOARD",
    LOG: "10_LOG_AUTOMACAO",
    REGRAS: "10_AUTOMACOES_REGRAS",
    PENDENCIAS: "11_PENDENCIAS_SANEAMENTO",
    MEMORIA: "14_MEMORIA_BASE_DOCUMENTOS",
    FILA: "15_FILA_PROCESSAMENTO"
  },
  GMAIL: {
    IMPORTAR: "WMGJ_IMPORTAR",
    PROCESSADO: "WMGJ_PROCESSADO"
  }
};

function getPlanilha() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const resultado = executarComandoWMGJ(payload);
    return respostaJson_(resultado);
  } catch (erro) {
    registrarLog("ERRO_DOPOST", erro.message || String(erro));
    return respostaJson_({ ok: false, etapa: "doPost", erro: erro.message || String(erro) });
  }
}

function executarComandoWMGJ(payload) {
  const comando = String(payload.comando || "").trim();
  if (comando === "status") return { ok: true, resposta: obterStatusWMGJ() };
  if (comando === "teste_execucao") return testarExecucaoWMGJ(payload);
  if (comando === "run" || comando === "runWMGJ" || comando === "operacao_total") return runWMGJ();
  if (comando === "gmail" || comando === "gmail_bancario") return importarGmailWMGJ();
  if (comando === "organizar") return organizarPastasWMGJ();
  if (comando === "dashboard") return atualizarDashboardWMGJ();
  return { ok: false, erro: "Comando não reconhecido", comando: comando };
}

function runWMGJ() {
  registrarLog("INICIO_ROBO", "Execução central iniciada");
  const resultados = [];
  resultados.push(organizarPastasWMGJ());
  resultados.push(importarGmailWMGJ());
  resultados.push(atualizarDashboardWMGJ());
  registrarLog("FIM_ROBO", "Execução central concluída");
  return { ok: true, comando: "runWMGJ", resultados: resultados };
}

function importarGmailWMGJ() {
  garantirLabelsGmail_();
  const ss = getPlanilha();
  const fila = obterOuCriarAba_(ss, CONFIG.SHEETS.FILA, ["DATA_ENTRADA", "ORIGEM", "ID_ORIGEM", "NOME", "TIPO", "STATUS", "OBSERVACAO"]);
  const memoria = obterOuCriarAba_(ss, CONFIG.SHEETS.MEMORIA, ["DATA_REGISTRO", "ORIGEM", "ID_ORIGEM", "NOME", "HASH", "STATUS", "RESUMO"]);
  const ids = carregarIds_(memoria, 2);
  const labelImportar = GmailApp.getUserLabelByName(CONFIG.GMAIL.IMPORTAR);
  const labelProcessado = GmailApp.getUserLabelByName(CONFIG.GMAIL.PROCESSADO);
  const threads = labelImportar ? labelImportar.getThreads(0, 50) : [];
  let importados = 0;
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const id = msg.getId();
      if (ids.has(id)) return;
      const assunto = msg.getSubject();
      const anexos = msg.getAttachments() || [];
      fila.appendRow([new Date(), "GMAIL", id, assunto, "EMAIL", "PENDENTE", "Mensagem importada"]);
      memoria.appendRow([new Date(), "GMAIL", id, assunto, "", "IMPORTADO", msg.getFrom()]);
      anexos.forEach(anexo => salvarAnexoGmail_(anexo, id, fila, memoria));
      msg.addLabel(labelProcessado);
      importados++;
    });
    thread.removeLabel(labelImportar);
  });
  registrarLog("GMAIL_IMPORTADO", "Mensagens importadas: " + importados);
  return { ok: true, etapa: "gmail", importados: importados };
}

function salvarAnexoGmail_(anexo, messageId, fila, memoria) {
  const pasta = DriveApp.getFolderById(CONFIG.PASTA_ENTRADA_ID);
  const arquivo = pasta.createFile(anexo.copyBlob());
  fila.appendRow([new Date(), "GMAIL_ANEXO", arquivo.getId(), arquivo.getName(), arquivo.getMimeType(), "PENDENTE", "Origem messageId: " + messageId]);
  memoria.appendRow([new Date(), "GMAIL_ANEXO", arquivo.getId(), arquivo.getName(), "", "SALVO_DRIVE", messageId]);
}

function organizarPastasWMGJ() {
  const raiz = DriveApp.getFolderById(CONFIG.PASTA_RAIZ_ID);
  const nomes = ["00_GOVERNANCA", "01_ENTRADA_DOCUMENTOS", "02_FINANCEIRO", "03_PRODUTIVIDADE", "04_RELATORIOS", "05_GLOSAS", "06_CONTRATOS", "07_BACKUP"];
  let criadas = 0;
  nomes.forEach(nome => {
    const existe = raiz.getFoldersByName(nome);
    if (!existe.hasNext()) {
      raiz.createFolder(nome);
      criadas++;
    }
  });
  registrarLog("DRIVE_ORGANIZADO", "Pastas criadas: " + criadas);
  return { ok: true, etapa: "organizar", pastasCriadas: criadas };
}

function atualizarDashboardWMGJ() {
  const ss = getPlanilha();
  const fin = ss.getSheetByName(CONFIG.SHEETS.FINANCEIRO);
  const dash = obterOuCriarAba_(ss, CONFIG.SHEETS.DASHBOARD, ["INDICADOR", "VALOR", "ATUALIZADO_EM"]);
  const dados = fin ? fin.getDataRange().getValues() : [];
  let receita = 0, recebido = 0, aberto = 0, despesa = 0, resultado = 0;
  if (dados.length > 1) {
    const h = dados[0];
    const iReceita = h.indexOf("RECEITA_BRUTA");
    const iRecebido = h.indexOf("RECEBIDO");
    const iAberto = h.indexOf("EM_ABERTO");
    const iDespesa = h.indexOf("DESPESA");
    const iResultado = h.indexOf("RESULTADO");
    dados.slice(1).forEach(l => {
      receita += Number(l[iReceita]) || 0;
      recebido += Number(l[iRecebido]) || 0;
      aberto += Number(l[iAberto]) || 0;
      despesa += Number(l[iDespesa]) || 0;
      resultado += Number(l[iResultado]) || 0;
    });
  }
  dash.clearContents();
  dash.appendRow(["INDICADOR", "VALOR", "ATUALIZADO_EM"]);
  dash.appendRow(["RECEITA_BRUTA", receita, new Date()]);
  dash.appendRow(["RECEBIDO", recebido, new Date()]);
  dash.appendRow(["EM_ABERTO", aberto, new Date()]);
  dash.appendRow(["DESPESA", despesa, new Date()]);
  dash.appendRow(["RESULTADO", resultado, new Date()]);
  registrarLog("DASHBOARD_ATUALIZADO", "Dashboard recalculado");
  return { ok: true, etapa: "dashboard", receita: receita, resultado: resultado };
}

function obterStatusWMGJ() {
  const ss = getPlanilha();
  const sheets = ss.getSheets().map(s => s.getName());
  return { planilha: ss.getName(), abas: sheets.length, gmailImportar: CONFIG.GMAIL.IMPORTAR, gmailProcessado: CONFIG.GMAIL.PROCESSADO, atualizadoEm: new Date() };
}

function testarExecucaoWMGJ(payload) {
  registrarLog("TESTE_OK", "Pipeline respondeu corretamente sem alterar base financeira");
  return { ok: true, comando: payload.comando, status: "TESTE_OK", mensagem: "Webhook, Apps Script e Sheets responderam corretamente", escrita: CONFIG.SHEETS.LOG };
}

function registrarLog(evento, detalhe) {
  const ss = getPlanilha();
  const aba = obterOuCriarAba_(ss, CONFIG.SHEETS.LOG, ["DATA_HORA", "EVENTO", "DETALHE"]);
  aba.appendRow([new Date(), evento, detalhe || ""]);
}

function obterOuCriarAba_(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (!aba) aba = ss.insertSheet(nome);
  if (aba.getLastRow() === 0 && cabecalho && cabecalho.length) aba.appendRow(cabecalho);
  return aba;
}

function carregarIds_(aba, colunaIndexZeroBased) {
  const dados = aba.getDataRange().getValues();
  return new Set(dados.slice(1).map(l => l[colunaIndexZeroBased]).filter(Boolean));
}

function garantirLabelsGmail_() {
  if (!GmailApp.getUserLabelByName(CONFIG.GMAIL.IMPORTAR)) GmailApp.createLabel(CONFIG.GMAIL.IMPORTAR);
  if (!GmailApp.getUserLabelByName(CONFIG.GMAIL.PROCESSADO)) GmailApp.createLabel(CONFIG.GMAIL.PROCESSADO);
}

function respostaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function testarWebhookInterno() {
  const url = "https://script.google.com/macros/s/AKfycbwqoyfMxLs4p_IRxEmt-Uo9OUF9q8LmJ84T4ydwGWx4yqrMOoxYy_3Q3NdtGPAQ-Ivc/exec";
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ comando: "teste_execucao", origem: "AppsScript" }),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}
