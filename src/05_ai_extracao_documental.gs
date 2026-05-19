/**
 * WMGJ - Camada isolada de extração documental e classificação AI/OCR
 *
 * Esta camada NÃO substitui nem altera o pipeline V3 estável.
 * Ela deve ser chamada somente depois que o arquivo estiver controlado pela fila V3.
 *
 * Fluxo pretendido:
 * Arquivo bruto -> Fila V3 -> Extração -> Classificação -> Validação JSON -> Memória-base
 */

const WMGJ_AI_STATUS = {
  versaoBase: 'v1.0.1-pipeline-estavel',
  camada: 'AI_OCR_EXTRACTION_LAYER',
  status: 'PREPARACAO_CONTROLADA'
};

/**
 * Ponto de entrada seguro para a camada AI/OCR.
 * Recebe metadados de um item já controlado pelo pipeline V3.
 */
function processarDocumentoComAI_WMGJ_V1(itemFila) {
  try {
    validarItemFilaAI_WMGJ_(itemFila);

    const textoExtraido = extrairTextoDocumento_WMGJ_(itemFila);
    const classificacao = classificarConteudoGemini_WMGJ_(textoExtraido, itemFila);
    const jsonValidado = validarJsonClassificacao_WMGJ_(classificacao, itemFila);

    registrarClassificacaoMemoriaBase_WMGJ_(jsonValidado, itemFila);

    return {
      ok: true,
      status: 'AI_PROCESSADO',
      arquivo_id: itemFila.arquivo_id || itemFila.fileId || '',
      categoria: jsonValidado.categoria || 'outro',
      confianca: jsonValidado.confianca || 0
    };
  } catch (erro) {
    return {
      ok: false,
      status: 'AI_ERRO',
      erro: erro.message,
      arquivo_id: itemFila && (itemFila.arquivo_id || itemFila.fileId) || ''
    };
  }
}

/**
 * Valida entrada mínima antes de qualquer chamada externa.
 */
function validarItemFilaAI_WMGJ_(itemFila) {
  if (!itemFila) {
    throw new Error('Item de fila ausente para processamento AI/OCR.');
  }

  const fileId = itemFila.arquivo_id || itemFila.fileId;
  if (!fileId) {
    throw new Error('Item de fila sem arquivo_id/fileId.');
  }

  return true;
}

/**
 * Extrai texto do documento.
 * Primeira versão: texto simples e documentos Google.
 * PDFs escaneados/imagens devem ser roteados depois para OCR/Document AI.
 */
function extrairTextoDocumento_WMGJ_(itemFila) {
  const fileId = itemFila.arquivo_id || itemFila.fileId;
  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();

  if (mimeType === MimeType.GOOGLE_DOCS) {
    return DocumentApp.openById(fileId).getBody().getText();
  }

  if (mimeType === MimeType.PLAIN_TEXT || mimeType === 'text/plain') {
    return file.getBlob().getDataAsString('UTF-8');
  }

  return '[OCR_PENDENTE] Tipo de arquivo ainda não suportado nesta camada: ' + mimeType;
}

/**
 * Chama Gemini para classificação estruturada.
 * Requer API key em PropertiesService: GEMINI_API_KEY
 */
function classificarConteudoGemini_WMGJ_(conteudoDocumento, itemFila) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada em Script Properties.');
  }

  const prompt = montarPromptClassificacaoWMGJ_(conteudoDocumento, itemFila);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Falha Gemini HTTP ' + code + ': ' + body);
  }

  const parsed = JSON.parse(body);
  const text = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts && parsed.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error('Resposta Gemini sem conteúdo JSON extraível.');
  }

  return JSON.parse(text);
}

/**
 * Prompt operacional WMGJ.
 */
function montarPromptClassificacaoWMGJ_(conteudoDocumento, itemFila) {
  return [
    'Você é o agente operacional WMGJ.',
    '',
    'Analise o documento e retorne APENAS JSON válido.',
    '',
    'Classifique em uma categoria:',
    '- financeiro',
    '- produtividade',
    '- contrato',
    '- glosa',
    '- relatório',
    '- cadastro',
    '- outro',
    '',
    'Retorne exatamente neste formato:',
    '{',
    '  "categoria": "",',
    '  "tipo_documento": "",',
    '  "data_documento": "",',
    '  "competencia": "",',
    '  "valor_total": "",',
    '  "nome_prestador": "",',
    '  "cnpj": "",',
    '  "medico": "",',
    '  "paciente": "",',
    '  "descricao": "",',
    '  "pendencias": [],',
    '  "nivel_risco": "",',
    '  "resumo_operacional": "",',
    '  "destino_drive": "",',
    '  "aba_planilha_destino": "",',
    '  "confianca": 0',
    '}',
    '',
    'Metadados do arquivo:',
    JSON.stringify(itemFila),
    '',
    'Documento:',
    conteudoDocumento
  ].join('\n');
}

/**
 * Validação mínima do JSON retornado pela IA.
 */
function validarJsonClassificacao_WMGJ_(json, itemFila) {
  if (!json || typeof json !== 'object') {
    throw new Error('Classificação AI inválida: JSON ausente.');
  }

  const categoriasValidas = ['financeiro', 'produtividade', 'contrato', 'glosa', 'relatório', 'cadastro', 'outro'];

  if (!json.categoria || categoriasValidas.indexOf(json.categoria) === -1) {
    json.categoria = 'outro';
  }

  if (typeof json.confianca !== 'number') {
    json.confianca = 0;
  }

  json.arquivo_id = itemFila.arquivo_id || itemFila.fileId || '';
  json.arquivo_nome = itemFila.arquivo_nome || itemFila.name || '';
  json.processado_em = new Date().toISOString();
  json.origem_processamento = 'AI_OCR_EXTRACTION_LAYER_V1';

  return json;
}

/**
 * Placeholder de gravação controlada.
 * Deve ser conectado à memória-base oficial após confirmar nomes de abas/colunas.
 */
function registrarClassificacaoMemoriaBase_WMGJ_(jsonValidado, itemFila) {
  // Implementar na próxima etapa com SpreadsheetApp e mapeamento oficial da memória-base.
  Logger.log(JSON.stringify({
    status: 'CLASSIFICACAO_VALIDADA_NAO_GRAVADA',
    data: jsonValidado
  }));
}
