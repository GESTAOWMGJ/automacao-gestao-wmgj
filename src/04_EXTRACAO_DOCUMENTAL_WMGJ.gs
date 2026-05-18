/**
 * WMGJ — Camada de extração documental real
 * Versão: v1.1.1-extracao-documental-compat
 *
 * Esta camada NÃO substitui a V3 estável.
 * Ela processa a mesma fila com extração real de conteúdo e grava na mesma memória-base
 * somente depois de classificação e validação JSON.
 *
 * Ajuste v1.1.1:
 * - remove dependência direta de garantirAbasControlePipelineWMGJ_V3_()
 * - usa helper próprio de compatibilidade para evitar erro em Apps Script com 01 incompleto
 */

var WMGJ_EXTRACAO_VERSAO = "v1.1.1-extracao-documental-compat";

function executarExtracaoRealWMGJ(limite) {
  return executarExtracaoRealWMGJ_V1(limite || 20);
}

function executarExtracaoRealWMGJ_V1(limite) {
  var preparo = prepararPipelineConfiavelWMGJ_V3(limite || 100);
  var processamento = processarFilaComExtracaoRealWMGJ_V1(limite || 20);

  var resultado = {
    ok: true,
    versao: WMGJ_EXTRACAO_VERSAO,
    etapa: "executarExtracaoRealWMGJ_V1",
    preparo: preparo,
    processamento: processamento
  };

  registrarLogWMGJ_("OK", "executarExtracaoRealWMGJ_V1", "AppsScript", JSON.stringify(resultado));
  return resultado;
}

function processarFilaComExtracaoRealWMGJ_V1(limite) {
  garantirAbasControleExtracaoWMGJ_V1_();
  garantirAbaExtracoesDocumentaisWMGJ_V1_();

  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();
  var fila = ss.getSheetByName(cfg.SHEETS.FILA);
  var memoria = ss.getSheetByName(cfg.SHEETS.MEMORIA);

  if (!fila || fila.getLastRow() < 2) {
    var vazio = {
      ok: true,
      versao: WMGJ_EXTRACAO_VERSAO,
      processados: 0,
      erros: 0,
      duplicados: 0,
      revisar: 0,
      mensagem: "Fila vazia"
    };
    registrarLogWMGJ_("OK", "processarFilaComExtracaoRealWMGJ_V1", "AppsScript", JSON.stringify(vazio));
    return vazio;
  }

  var dados = fila.getDataRange().getValues();
  var idx = mapearCabecalhoWMGJ_(dados[0]);
  var max = Number(limite) || 20;

  var avaliados = 0;
  var processados = 0;
  var erros = 0;
  var duplicados = 0;
  var revisar = 0;

  for (var i = 1; i < dados.length && avaliados < max; i++) {
    var linha = dados[i];
    var status = String(linha[idx.STATUS] || "").toUpperCase();
    var idOrigem = String(linha[idx.ID_ORIGEM] || "");

    if (status !== "PENDENTE" && status !== "ERRO_REPROCESSAR") {
      continue;
    }

    avaliados++;

    try {
      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "EXTRAINDO",
        ULTIMO_ERRO: "",
        OBSERVACAO: "Extração real V1 iniciada"
      });

      var file = DriveApp.getFileById(idOrigem);
      var hash = gerarHashArquivoWMGJ_(file);

      if (documentoJaProcessadoWMGJ_(idOrigem, hash)) {
        atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
          STATUS: "DUPLICADO",
          ULTIMO_ERRO: "",
          OBSERVACAO: "Arquivo já reconhecido por ID_ORIGEM + HASH"
        });
        duplicados++;
        continue;
      }

      var extracao = extrairConteudoArquivoWMGJ_V1_(file);
      registrarExtracaoDocumentalWMGJ_V1_(file, hash, extracao);

      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "CLASSIFICANDO",
        OBSERVACAO: "Conteúdo extraído por " + extracao.metodo
      });

      var classificacao = classificarDocumentoGeminiOuFallbackWMGJ_V1_(extracao, file);
      var validacao = validarDocumentoJsonWMGJ_(classificacao);

      if (!validacao.ok) {
        atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
          STATUS: "REVISAR_HUMANO",
          TENTATIVAS: Number(linha[idx.TENTATIVAS] || 0) + 1,
          ULTIMO_ERRO: validacao.erro,
          OBSERVACAO: "Extração feita, mas classificação JSON falhou"
        });
        revisar++;
        continue;
      }

      registrarDocumentoMemoriaWMGJ_(memoria, {
        origem: "DRIVE_EXTRACAO_REAL",
        idOrigem: idOrigem,
        nome: file.getName(),
        mimeType: file.getMimeType(),
        hash: hash,
        competencia: validacao.dados.competencia || "",
        categoria: validacao.dados.categoria || "outro",
        status: "PROCESSADO",
        resumo: montarResumoMemoriaExtracaoWMGJ_V1_(validacao.dados, extracao)
      });

      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "PROCESSADO",
        ULTIMO_ERRO: "",
        OBSERVACAO: "Extração real + classificação + memória-base OK"
      });

      processados++;

    } catch (erro) {
      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "ERRO_REPROCESSAR",
        TENTATIVAS: Number(linha[idx.TENTATIVAS] || 0) + 1,
        ULTIMO_ERRO: erro && erro.message ? erro.message : String(erro),
        OBSERVACAO: "Falha isolada na extração real; lote continua"
      });
      erros++;
    }
  }

  var resultado = {
    ok: true,
    versao: WMGJ_EXTRACAO_VERSAO,
    etapa: "processarFilaComExtracaoRealWMGJ_V1",
    avaliados: avaliados,
    processados: processados,
    erros: erros,
    duplicados: duplicados,
    revisar: revisar
  };

  registrarLogWMGJ_("OK", "processarFilaComExtracaoRealWMGJ_V1", "AppsScript", JSON.stringify(resultado));
  return resultado;
}

function extrairConteudoArquivoWMGJ_V1_(file) {
  var mime = file.getMimeType();
  var resultado = {
    ok: true,
    versao: WMGJ_EXTRACAO_VERSAO,
    arquivoId: file.getId(),
    nome: file.getName(),
    mimeType: mime,
    metodo: "metadata_fallback",
    texto: "",
    tamanhoTexto: 0,
    observacao: ""
  };

  try {
    if (mime === MimeType.GOOGLE_DOCS) {
      resultado.metodo = "google_docs_text";
      resultado.texto = DocumentApp.openById(file.getId()).getBody().getText();
      resultado.tamanhoTexto = resultado.texto.length;
      return resultado;
    }

    if (mime === MimeType.GOOGLE_SHEETS) {
      resultado.metodo = "google_sheets_values";
      resultado.texto = extrairTextoGoogleSheetsWMGJ_V1_(file.getId());
      resultado.tamanhoTexto = resultado.texto.length;
      return resultado;
    }

    if (mime === MimeType.PLAIN_TEXT || mime.indexOf("text/") === 0 || mime.indexOf("csv") >= 0 || mime.indexOf("json") >= 0) {
      resultado.metodo = "blob_text";
      resultado.texto = file.getBlob().getDataAsString("UTF-8");
      resultado.tamanhoTexto = resultado.texto.length;
      return resultado;
    }

    if (mime === MimeType.PDF || mime.indexOf("pdf") >= 0 || mime.indexOf("image/") === 0 || mime.indexOf("officedocument") >= 0 || mime.indexOf("ms-excel") >= 0 || mime.indexOf("msword") >= 0) {
      var convertido = converterArquivoParaGoogleDocWMGJ_V1_(file);
      if (convertido.ok && convertido.texto) {
        resultado.metodo = convertido.metodo;
        resultado.texto = convertido.texto;
        resultado.tamanhoTexto = convertido.texto.length;
        resultado.observacao = convertido.observacao || "";
        return resultado;
      }
      resultado.observacao = convertido.erro || "Conversão não retornou texto";
    }
  } catch (erro) {
    resultado.ok = false;
    resultado.observacao = erro && erro.message ? erro.message : String(erro);
  }

  resultado.texto = [
    "NOME_ARQUIVO: " + file.getName(),
    "MIME_TYPE: " + mime,
    "ID: " + file.getId(),
    "OBS: " + resultado.observacao
  ].join("\n");
  resultado.tamanhoTexto = resultado.texto.length;
  return resultado;
}

function converterArquivoParaGoogleDocWMGJ_V1_(file) {
  if (typeof Drive === "undefined" || !Drive.Files || typeof Drive.Files.copy !== "function") {
    return {
      ok: false,
      metodo: "drive_api_indisponivel",
      erro: "Serviço avançado Drive API não habilitado no Apps Script"
    };
  }

  var copiaId = "";

  try {
    var resource = {
      title: "WMGJ_OCR_TMP_" + file.getName(),
      mimeType: MimeType.GOOGLE_DOCS
    };

    var copia = Drive.Files.copy(resource, file.getId(), { ocr: true, ocrLanguage: "pt" });
    copiaId = copia.id;
    Utilities.sleep(1500);

    var texto = DocumentApp.openById(copiaId).getBody().getText();

    try {
      DriveApp.getFileById(copiaId).setTrashed(true);
    } catch (erroTrash) {}

    return {
      ok: true,
      metodo: "drive_api_ocr_convert",
      texto: texto || "",
      observacao: "Arquivo convertido temporariamente para Google Docs e removido após leitura"
    };

  } catch (erro) {
    if (copiaId) {
      try {
        DriveApp.getFileById(copiaId).setTrashed(true);
      } catch (erroTrash2) {}
    }

    return {
      ok: false,
      metodo: "drive_api_ocr_convert",
      erro: erro && erro.message ? erro.message : String(erro)
    };
  }
}

function extrairTextoGoogleSheetsWMGJ_V1_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var partes = [];

  ss.getSheets().forEach(function(sheet) {
    var dados = sheet.getDataRange().getDisplayValues();
    partes.push("ABA: " + sheet.getName());
    dados.slice(0, 200).forEach(function(linha) {
      partes.push(linha.join(" | "));
    });
  });

  return partes.join("\n");
}

function classificarDocumentoGeminiOuFallbackWMGJ_V1_(extracao, file) {
  if (typeof classificarDocumentoGeminiWMGJ_V1 === "function") {
    return classificarDocumentoGeminiWMGJ_V1(extracao, file);
  }

  return classificarDocumentoFallbackWMGJ_(extracao.texto || "", file);
}

function montarResumoMemoriaExtracaoWMGJ_V1_(dados, extracao) {
  var resumo = {
    versao_extracao: WMGJ_EXTRACAO_VERSAO,
    metodo_extracao: extracao.metodo,
    tamanho_texto: extracao.tamanhoTexto,
    categoria: dados.categoria || "",
    tipo_documento: dados.tipo_documento || "",
    competencia: dados.competencia || "",
    valor_total: dados.valor_total || 0,
    atendimentos: dados.atendimentos || 0,
    confianca: dados.confianca || 0,
    resumo_operacional: dados.resumo_operacional || dados.descricao || ""
  };

  return JSON.stringify(resumo);
}

function garantirAbaExtracoesDocumentaisWMGJ_V1_() {
  var ss = getPlanilha();
  return obterOuCriarAba_(ss, "16_EXTRACOES_DOCUMENTAIS", [
    "DATA_EXTRACAO",
    "VERSAO",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "HASH",
    "METODO_EXTRACAO",
    "TAMANHO_TEXTO",
    "STATUS",
    "OBSERVACAO",
    "AMOSTRA_TEXTO"
  ]);
}

function registrarExtracaoDocumentalWMGJ_V1_(file, hash, extracao) {
  var aba = garantirAbaExtracoesDocumentaisWMGJ_V1_();
  aba.appendRow([
    new Date(),
    WMGJ_EXTRACAO_VERSAO,
    file.getId(),
    file.getName(),
    file.getMimeType(),
    hash,
    extracao.metodo,
    extracao.tamanhoTexto || 0,
    extracao.ok ? "OK" : "FALLBACK",
    extracao.observacao || "",
    String(extracao.texto || "").slice(0, 2000)
  ]);
}

function diagnosticarExtracaoRealWMGJ_V1() {
  var gemini = typeof diagnosticarGeminiWMGJ_V1 === "function" ? diagnosticarGeminiWMGJ_V1() : { ok: false, erro: "diagnosticarGeminiWMGJ_V1 indisponivel" };
  var driveApi = typeof Drive !== "undefined" && !!Drive.Files;
  var pasta = diagnosticarPastaEntradaWMGJ_V3();

  var resultado = {
    ok: true,
    versao: WMGJ_EXTRACAO_VERSAO,
    pastaEntrada: pasta,
    gemini: gemini,
    driveApiAvancadoDisponivel: driveApi,
    abas: {
      fila: getConfigWMGJ_().SHEETS.FILA,
      memoria: getConfigWMGJ_().SHEETS.MEMORIA,
      extracoes: "16_EXTRACOES_DOCUMENTAIS"
    }
  };

  registrarLogWMGJ_("DIAGNOSTICO", "diagnosticarExtracaoRealWMGJ_V1", "AppsScript", JSON.stringify({
    ok: resultado.ok,
    geminiConfigurado: !!(gemini && gemini.configurado),
    driveApiAvancadoDisponivel: driveApi
  }));

  return resultado;
}

function garantirAbasControleExtracaoWMGJ_V1_() {
  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();

  obterOuCriarAba_(ss, "13_CONTROLE_PIPELINE", [
    "ETAPA",
    "COMPONENTE",
    "STATUS_ATUAL",
    "EVIDENCIA",
    "RISCO",
    "ACAO_CORRETIVA",
    "RESPONSAVEL",
    "SLA",
    "BLOQUEIA_PRODUCAO",
    "ULTIMA_VALIDACAO",
    "OBS"
  ]);

  obterOuCriarAba_(ss, cfg.SHEETS.MEMORIA, cabecalhoMemoriaExtracaoWMGJ_V1_());
  obterOuCriarAba_(ss, cfg.SHEETS.FILA, cabecalhoFilaExtracaoWMGJ_V1_());

  return {
    ok: true,
    versao: WMGJ_EXTRACAO_VERSAO,
    mensagem: "Abas de controle da extração garantidas sem depender de helper privado V3"
  };
}

function cabecalhoFilaExtracaoWMGJ_V1_() {
  return [
    "DATA_ENTRADA",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "STATUS",
    "TENTATIVAS",
    "PROXIMA_ACAO",
    "ULTIMO_ERRO",
    "OBSERVACAO"
  ];
}

function cabecalhoMemoriaExtracaoWMGJ_V1_() {
  return [
    "DATA_PROCESSAMENTO",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "HASH",
    "COMPETENCIA",
    "CATEGORIA",
    "STATUS",
    "RESUMO"
  ];
}