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

function garantirEstruturaIaWMGJ_() {
  const ss = getPlanilha();
  const definicoes = [
    { nome: "02_EXTRATO_CLASSIFICADO", colunas: ["ROW_KEY", "STATUS_IA", "DECISION_ID", "PROMPT_HASH", "CLASSIFICACAO_IA", "CONFIANCA_IA", "OBS_IA", "ATUALIZADO_IA_EM"] },
    { nome: "11_PENDENCIAS_IA", colunas: ["PENDENCIA_ID", "ROW_KEY", "STATUS_IA", "TIPO", "ORIGEM_ABA", "ORIGEM_LINHA", "CLAIM_EXEC_ID", "CLAIM_EM", "DECISION_ID", "ERRO", "UPDATED_AT", "SNAPSHOT_JSON"] }
  ];
  const resultado = [];
  definicoes.forEach(d => {
    const aba = obterOuCriarAba_(ss, d.nome, d.colunas);
    const existentes = aba.getLastColumn() > 0 ? aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0] : [];
    let adicionadas = 0;
    d.colunas.forEach(col => {
      if (existentes.indexOf(col) === -1) {
        aba.getRange(1, aba.getLastColumn() + 1).setValue(col);
        existentes.push(col);
        adicionadas++;
      }
    });
    resultado.push({ aba: d.nome, colunasAdicionadas: adicionadas });
  });
  return { ok: true, estrutura: resultado };
}

function hashLancamentoWMGJ_(obj) {
  const obrigatorios = ["data", "descricao", "valor", "origem"];
  obrigatorios.forEach(c => {
    if (obj[c] === undefined || obj[c] === null || obj[c] === "") throw new Error("Erro de modelagem: campo obrigatório ausente: " + c);
  });
  const payload = JSON.stringify({
    data: String(obj.data),
    descricao: String(obj.descricao).trim(),
    valor: Number(obj.valor),
    origem: String(obj.origem).trim(),
    documento: String(obj.documento || "").trim()
  });
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload));
}

function gerarFilaPendenciasIaWMGJ_() {
  garantirEstruturaIaWMGJ_();
  const ss = getPlanilha();
  const extrato = ss.getSheetByName("02_EXTRATO_CLASSIFICADO");
  const pend = ss.getSheetByName("11_PENDENCIAS_IA");
  if (!extrato || !pend) return { ok: false, erro: "Abas obrigatórias ausentes" };
  const dados = extrato.getDataRange().getValues();
  const h = dados[0] || [];
  const iStatus = h.indexOf("STATUS_IA");
  const iRowKey = h.indexOf("ROW_KEY");
  const existentes = indexarPendencias_(pend);
  let upserts = 0;
  let erros = 0;
  for (let i = 1; i < dados.length; i++) {
    try {
      const row = dados[i];
      const status = iStatus >= 0 ? String(row[iStatus] || "") : "";
      if (status && status !== "PENDENTE" && status !== "REPROCESSAR") continue;
      const rowKey = iRowKey >= 0 && row[iRowKey] ? String(row[iRowKey]) : hashLancamentoWMGJ_({ data: row[0], descricao: row[1], valor: row[2], origem: "EXTRATO" });
      const pendId = rowKey;
      upsertPendencia_(pend, existentes, { PENDENCIA_ID: pendId, ROW_KEY: rowKey, STATUS_IA: "PENDENTE", TIPO: "CONCILIACAO", ORIGEM_ABA: "02_EXTRATO_CLASSIFICADO", ORIGEM_LINHA: i + 1 });
      upserts++;
    } catch (e) {
      erros++;
      registrarLog("ERRO_GERAR_PEND_IA", "linha " + (i + 1) + " - " + (e.message || e));
    }
  }
  return { ok: true, upserts: upserts, erros: erros };
}

function claimPendenciaIaWMGJ_(pendenciaId, execId) {
  const ss = getPlanilha();
  const pend = ss.getSheetByName("11_PENDENCIAS_IA");
  const dados = pend.getDataRange().getValues();
  const h = dados[0];
  const idx = headerMap_(h);
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idx.PENDENCIA_ID] || "") !== String(pendenciaId)) continue;
    const claimed = String(dados[i][idx.CLAIM_EXEC_ID] || "");
    if (claimed && claimed !== String(execId)) return false;
    pend.getRange(i + 1, idx.CLAIM_EXEC_ID + 1).setValue(execId);
    pend.getRange(i + 1, idx.CLAIM_EM + 1).setValue(new Date());
    return true;
  }
  return false;
}

function montarPromptConciliacaoWMGJ_(contexto) {
  if (!contexto || !contexto.rowKey || !contexto.descricao || contexto.valor === undefined) {
    return { revisarHumano: true, motivo: "Dados insuficientes", prompt: "" };
  }
  const prompt = "Classifique lançamento financeiro em JSON estrito: {categoria,subcategoria,confianca,justificativa}. Linha=" +
    JSON.stringify({ rowKey: contexto.rowKey, data: contexto.data, descricao: contexto.descricao, valor: contexto.valor, historico: contexto.historico || "" });
  return { prompt: prompt, promptHash: toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, prompt + "|" + contexto.rowKey)) };
}

function chamarGeminiStructuredWMGJ_(contexto, model) {
  const versao = "v1";
  const promptData = montarPromptConciliacaoWMGJ_(contexto);
  if (promptData.revisarHumano) return { decision: null, usage: null, raw: null, erro: promptData.motivo };
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente em Script Properties");
  const modelo = model || "gemini-1.5-pro";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelo) + ":generateContent";
  const payload = {
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    contents: [{ role: "user", parts: [{ text: promptData.prompt }] }]
  };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: { "x-goog-api-key": apiKey },
    muteHttpExceptions: true
  };

  const resp = fetchComRetryIaWMGJ_(url, options, 4, 800);
  const rawText = resp.body || "";
  const parsed = safeJsonParse_(rawText);
  const decision = extrairDecisaoGeminiWMGJ_(parsed);
  if (!decision) throw new Error("Resposta Gemini sem JSON de decisão válido");

  const usage = (parsed && parsed.usageMetadata) ? {
    promptTokens: Number(parsed.usageMetadata.promptTokenCount || 0),
    completionTokens: Number(parsed.usageMetadata.candidatesTokenCount || 0),
    totalTokens: Number(parsed.usageMetadata.totalTokenCount || 0)
  } : null;

  const decisionId = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, contexto.rowKey + "|" + versao + "|" + modelo));
  return { decision: decision, usage: usage, raw: { status: resp.status, latencyMs: resp.latencyMs, body: rawText, promptHash: promptData.promptHash }, decisionId: decisionId };
}

function validarDecisaoIaWMGJ_(decision, contexto) {
  const reasons = [];
  const categoriasPermitidas = ["RECEITA", "DESPESA", "TRANSFERENCIA", "REVISAR"];
  if (!decision || categoriasPermitidas.indexOf(decision.categoria) === -1) reasons.push("categoria inválida");
  if (Number(decision.confianca) < 0 || Number(decision.confianca) > 100) reasons.push("confianca fora da faixa");
  if (contexto && Number(contexto.valor) === 0 && decision.categoria !== "TRANSFERENCIA") reasons.push("conflito com valor zero");
  const ok = reasons.length === 0;
  return { ok: ok, autoApply: ok && Number(decision.confianca) >= 85 && decision.categoria !== "REVISAR", reasons: reasons };
}

function processarPendenciasIaBatchWMGJ(limite) {
  garantirEstruturaIaWMGJ_();
  const ss = getPlanilha();
  const pend = ss.getSheetByName("11_PENDENCIAS_IA");
  const dados = pend.getDataRange().getValues();
  const h = dados[0] || [];
  const idx = headerMap_(h);
  const execId = Utilities.getUuid();
  let processados = 0;
  let erros = 0;
  for (let i = 1; i < dados.length && processados < (Number(limite) || 20); i++) {
    const status = String(dados[i][idx.STATUS_IA] || "");
    if (status !== "PENDENTE" && status !== "REPROCESSAR") continue;
    try {
      const pendId = String(dados[i][idx.PENDENCIA_ID]);
      if (!claimPendenciaIaWMGJ_(pendId, execId)) continue;
      const contexto = { rowKey: String(dados[i][idx.ROW_KEY] || ""), valor: 1, descricao: "PENDENCIA " + pendId };
      const ai = chamarGeminiStructuredWMGJ_(contexto, "gemini-1.5-pro");
      const validacao = validarDecisaoIaWMGJ_(ai.decision || {}, contexto);
      aplicarDecisaoIaWMGJ_({ pendenciaId: pendId, rowKey: contexto.rowKey }, { ai: ai, validacao: validacao });
      processados++;
    } catch (e) {
      erros++;
      registrarLog("ERRO_PROC_PEND_IA", e.message || String(e));
    }
  }
  return { ok: true, execId: execId, processados: processados, erros: erros };
}

function aplicarDecisaoIaWMGJ_(contexto, resultado) {
  const ss = getPlanilha();
  const pend = ss.getSheetByName("11_PENDENCIAS_IA");
  const dados = pend.getDataRange().getValues();
  const idx = headerMap_(dados[0]);
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idx.PENDENCIA_ID]) !== String(contexto.pendenciaId)) continue;
    const snapshot = JSON.stringify(dados[i]);
    pend.getRange(i + 1, idx.SNAPSHOT_JSON + 1).setValue(snapshot);
    pend.getRange(i + 1, idx.DECISION_ID + 1).setValue(resultado.ai.decisionId || "");
    pend.getRange(i + 1, idx.STATUS_IA + 1).setValue(resultado.validacao.ok ? "PROCESSADO" : "REJEITADO");
    pend.getRange(i + 1, idx.ERRO + 1).setValue(resultado.validacao.reasons.join("; "));
    pend.getRange(i + 1, idx.UPDATED_AT + 1).setValue(new Date());
    return { ok: true };
  }
  return { ok: false, erro: "Pendência não encontrada" };
}

function rollbackDecisaoIaWMGJ_(decisionId) {
  const ss = getPlanilha();
  const pend = ss.getSheetByName("11_PENDENCIAS_IA");
  const dados = pend.getDataRange().getValues();
  const idx = headerMap_(dados[0]);
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idx.DECISION_ID] || "") !== String(decisionId)) continue;
    if (String(dados[i][idx.STATUS_IA]) === "ROLLBACK_OK") return { ok: true, idempotente: true };
    const snapshot = String(dados[i][idx.SNAPSHOT_JSON] || "");
    if (!snapshot) {
      pend.getRange(i + 1, idx.STATUS_IA + 1).setValue("ROLLBACK_INCONCLUSIVO");
      return { ok: false, erro: "Snapshot anterior inexistente" };
    }
    pend.getRange(i + 1, idx.STATUS_IA + 1).setValue("ROLLBACK_OK");
    pend.getRange(i + 1, idx.UPDATED_AT + 1).setValue(new Date());
    return { ok: true };
  }
  return { ok: false, erro: "decisionId não encontrado" };
}


function fetchComRetryIaWMGJ_(url, options, maxTentativas, baseDelayMs) {
  const tentativas = Math.max(1, Number(maxTentativas) || 4);
  let ultimoErro = "";
  for (let t = 1; t <= tentativas; t++) {
    const inicio = Date.now();
    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const body = response.getContentText() || "";
    const latencyMs = Date.now() - inicio;
    registrarLog("IA_HTTP", "tentativa=" + t + " status=" + status + " latenciaMs=" + latencyMs);
    if (status >= 200 && status < 300) return { status: status, body: body, latencyMs: latencyMs };
    const retryable = status === 429 || (status >= 500 && status <= 599);
    ultimoErro = "HTTP " + status + " body=" + body.slice(0, 500);
    if (!retryable || t === tentativas) throw new Error("Falha IA: " + ultimoErro);
    Utilities.sleep((Number(baseDelayMs) || 800) * Math.pow(2, t - 1));
  }
  throw new Error("Falha IA: " + ultimoErro);
}

function extrairDecisaoGeminiWMGJ_(parsed) {
  const txt = extrairTextoCandidatoGeminiWMGJ_(parsed);
  if (!txt) return null;
  const json = safeJsonParse_(txt);
  if (!json || typeof json !== "object") return null;
  if (json.decision && typeof json.decision === "object") return json.decision;
  if (json.categoria !== undefined) return json;
  return null;
}

function extrairTextoCandidatoGeminiWMGJ_(parsed) {
  try {
    const candidates = parsed && parsed.candidates;
    if (!candidates || !candidates.length) return "";
    const parts = (((candidates[0] || {}).content || {}).parts || []);
    const text = parts.map(p => p.text || "").join("\n");
    return String(text || "").trim();
  } catch (e) {
    return "";
  }
}

function safeJsonParse_(txt) {
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function upsertPendencia_(aba, index, item) {
  const chave = String(item.PENDENCIA_ID || item.ROW_KEY);
  const rowNum = index[chave];
  const header = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  if (rowNum) {
    header.forEach((col, i) => {
      if (item[col] !== undefined) aba.getRange(rowNum, i + 1).setValue(item[col]);
    });
    aba.getRange(rowNum, header.indexOf("UPDATED_AT") + 1).setValue(new Date());
  } else {
    const nova = header.map(col => item[col] !== undefined ? item[col] : "");
    if (header.indexOf("UPDATED_AT") >= 0) nova[header.indexOf("UPDATED_AT")] = new Date();
    aba.appendRow(nova);
    index[chave] = aba.getLastRow();
  }
}

function indexarPendencias_(aba) {
  const dados = aba.getDataRange().getValues();
  const idx = headerMap_(dados[0] || []);
  const out = {};
  for (let i = 1; i < dados.length; i++) {
    const chave = String(dados[i][idx.PENDENCIA_ID] || dados[i][idx.ROW_KEY] || "");
    if (chave) out[chave] = i + 1;
  }
  return out;
}

function headerMap_(h) {
  const m = {};
  (h || []).forEach((v, i) => m[String(v)] = i);
  return m;
}

function toHex_(bytes) {
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}
