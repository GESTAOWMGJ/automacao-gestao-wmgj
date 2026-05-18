/**
 * WMGJ — Classificador Gemini
 * Versão: v1.1.0-gemini-classificador
 *
 * Não grava nada sozinho em planilha.
 * Recebe conteúdo extraído, chama Gemini quando configurado e retorna JSON validável.
 * A gravação continua controlada pela camada de extração/pipeline. Civilização, enfim.
 *
 * Configuração obrigatória no Apps Script:
 * PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', 'SUA_CHAVE')
 *
 * Opcional:
 * PropertiesService.getScriptProperties().setProperty('GEMINI_MODEL', 'gemini-1.5-flash')
 */

var WMGJ_GEMINI_VERSAO = "v1.1.0-gemini-classificador";

function diagnosticarGeminiWMGJ_V1() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY");
  var model = props.getProperty("GEMINI_MODEL") || "gemini-1.5-flash";

  return {
    ok: true,
    versao: WMGJ_GEMINI_VERSAO,
    configurado: !!apiKey,
    modelo: model,
    mensagem: apiKey ? "Gemini configurado" : "GEMINI_API_KEY ausente em Script Properties"
  };
}

function classificarDocumentoGeminiWMGJ_V1(extracao, file) {
  var diag = diagnosticarGeminiWMGJ_V1();

  if (!diag.configurado) {
    registrarLogWMGJ_("AVISO", "classificarDocumentoGeminiWMGJ_V1", "AppsScript", "Gemini sem API key; usando fallback local");
    return classificarDocumentoFallbackWMGJ_(extracao.texto || "", file);
  }

  try {
    var prompt = montarPromptGeminiDocumentoWMGJ_V1_(extracao, file);
    var resposta = chamarGeminiWMGJ(prompt);
    var limpo = limparRespostaJsonWMGJ_(resposta);
    var dados = JSON.parse(limpo);

    if (dados && typeof dados === "object") {
      dados.origem_classificacao = "gemini";
      dados.modelo = diag.modelo;
    }

    return dados;

  } catch (erro) {
    registrarLogWMGJ_("ERRO", "classificarDocumentoGeminiWMGJ_V1", "AppsScript", erro && erro.message ? erro.message : String(erro));
    return classificarDocumentoFallbackWMGJ_(extracao.texto || "", file);
  }
}

function chamarGeminiWMGJ(prompt) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY");
  var model = props.getProperty("GEMINI_MODEL") || "gemini-1.5-flash";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_NAO_CONFIGURADA");
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

  var payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: String(prompt || "") }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error("GEMINI_HTTP_" + code + ": " + body.slice(0, 500));
  }

  var json = JSON.parse(body);
  var text = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("GEMINI_RESPOSTA_SEM_TEXTO: " + body.slice(0, 500));
  }

  return text;
}

function montarPromptGeminiDocumentoWMGJ_V1_(extracao, file) {
  var texto = String((extracao && extracao.texto) || "").slice(0, 24000);
  var nome = file ? file.getName() : ((extracao && extracao.nome) || "");
  var mime = file ? file.getMimeType() : ((extracao && extracao.mimeType) || "");

  return [
    "Você é o agente operacional documental da WMGJ.",
    "Analise o documento e retorne APENAS JSON válido, sem markdown, sem explicação externa.",
    "Categorias permitidas: financeiro, produtividade, contrato, glosa, relatorio, cadastro, outro.",
    "A confiança deve ser número entre 0 e 1. Use abaixo de 0.6 quando o documento não permitir conclusão segura.",
    "Campos obrigatórios do JSON:",
    "{",
    "  \"categoria\": \"financeiro|produtividade|contrato|glosa|relatorio|cadastro|outro\",",
    "  \"tipo_documento\": \"\",",
    "  \"data_documento\": \"YYYY-MM-DD ou vazio\",",
    "  \"competencia\": \"YYYY-MM ou vazio\",",
    "  \"valor_total\": 0,",
    "  \"atendimentos\": 0,",
    "  \"nome_prestador\": \"\",",
    "  \"cnpj\": \"\",",
    "  \"medico\": \"\",",
    "  \"paciente\": \"\",",
    "  \"descricao\": \"\",",
    "  \"pendencias\": [],",
    "  \"nivel_risco\": \"baixo|medio|alto\",",
    "  \"resumo_operacional\": \"\",",
    "  \"destino_drive\": \"\",",
    "  \"aba_planilha_destino\": \"\",",
    "  \"confianca\": 0",
    "}",
    "Nome do arquivo: " + nome,
    "MIME type: " + mime,
    "Método de extração: " + ((extracao && extracao.metodo) || ""),
    "Texto extraído:",
    texto
  ].join("\n");
}

function testeGeminiClassificadorWMGJ_V1() {
  var fakeFile = {
    getName: function() { return "TESTE_GEMINI_WMGJ.txt"; },
    getMimeType: function() { return "text/plain"; }
  };

  var extracao = {
    texto: "Relatório de produtividade WMGJ. Competência 2026-04. Foram realizados 42 atendimentos. Valor total R$ 4.200,00.",
    metodo: "teste_texto",
    tamanhoTexto: 116
  };

  var dados = classificarDocumentoGeminiWMGJ_V1(extracao, fakeFile);
  var validacao = validarDocumentoJsonWMGJ_(dados);

  var resultado = {
    ok: validacao.ok,
    versao: WMGJ_GEMINI_VERSAO,
    dados: dados,
    validacao: validacao
  };

  registrarLogWMGJ_(validacao.ok ? "TESTE_OK" : "ERRO", "testeGeminiClassificadorWMGJ_V1", "AppsScript", JSON.stringify(resultado));
  return resultado;
}
