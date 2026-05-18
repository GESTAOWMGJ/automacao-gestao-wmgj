/**
 * WMGJ — Controle central de execução e confiabilidade do pipeline
 *
 * Depende do núcleo oficial em src/00_CORE_WMGJ.gs:
 * - getConfigWMGJ_()
 * - getPlanilha()
 * - obterOuCriarAba_(ss, nome, cabecalho)
 * - registrarLogWMGJ_(status, comando, origem, mensagem)
 *
 * Regras desta versão:
 * - fila operacional fica em 15_FILA_PROCESSAMENTO;
 * - memória permanente fica em 14_MEMORIA_BASE_DOCUMENTOS;
 * - PENDENTE na fila NÃO é gravado na memória-base;
 * - só PROCESSADO ou DUPLICADO na memória-base bloqueiam novo processamento;
 * - falha individual de arquivo não derruba o lote inteiro.
 */

function prepararPipelineConfiavelWMGJ() {
  garantirAbasControlePipelineWMGJ_();

  var resultado = enfileirarArquivosEntradaWMGJ(100);

  registrarLogWMGJ_(
    "OK",
    "prepararPipelineConfiavelWMGJ",
    "AppsScript",
    JSON.stringify(resultado)
  );

  return {
    ok: true,
    etapa: "prepararPipelineConfiavelWMGJ",
    resultado: resultado,
    entrada: resultado
  };
}

function garantirAbasControlePipelineWMGJ_() {
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

  obterOuCriarAba_(ss, cfg.SHEETS.MEMORIA, [
    "DATA_REGISTRO",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "HASH",
    "COMPETENCIA",
    "CATEGORIA",
    "STATUS",
    "RESUMO_AI"
  ]);

  obterOuCriarAba_(ss, cfg.SHEETS.FILA, [
    "DATA_ENTRADA",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME",
    "TIPO",
    "STATUS",
    "TENTATIVAS",
    "PROXIMA_ACAO",
    "ULTIMO_ERRO",
    "OBSERVACAO"
  ]);

  return {
    ok: true,
    mensagem: "Abas de controle garantidas"
  };
}

/**
 * Enfileira arquivos do Drive.
 * Correção central: esta função NÃO grava PENDENTE na memória-base.
 */
function enfileirarArquivosEntradaWMGJ(limite) {
  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();

  var fila = obterOuCriarAba_(ss, cfg.SHEETS.FILA, [
    "DATA_ENTRADA",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME",
    "TIPO",
    "STATUS",
    "TENTATIVAS",
    "PROXIMA_ACAO",
    "ULTIMO_ERRO",
    "OBSERVACAO"
  ]);

  obterOuCriarAba_(ss, cfg.SHEETS.MEMORIA, [
    "DATA_REGISTRO",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "HASH",
    "COMPETENCIA",
    "CATEGORIA",
    "STATUS",
    "RESUMO_AI"
  ]);

  var pasta = DriveApp.getFolderById(cfg.PASTA_ENTRADA_ID);
  var arquivos = pasta.getFiles();
  var idsNaFila = carregarIdsFilaWMGJ_(fila);

  var lidos = 0;
  var enfileirados = 0;
  var duplicados = 0;
  var max = Number(limite) || 100;

  while (arquivos.hasNext() && lidos < max) {
    var file = arquivos.next();
    lidos++;

    var id = file.getId();
    var nome = file.getName();
    var mime = file.getMimeType();
    var hash = gerarHashArquivoWMGJ_(file);

    if (idsNaFila[id] || documentoJaProcessadoWMGJ_(id, hash)) {
      duplicados++;
      continue;
    }

    fila.appendRow([
      new Date(),
      "DRIVE",
      id,
      nome,
      mime,
      "PENDENTE",
      0,
      "EXTRAIR_CLASSIFICAR",
      "",
      "Entrada automática pasta 01_ENTRADA_DOCUMENTOS"
    ]);

    idsNaFila[id] = true;
    enfileirados++;
  }

  return {
    ok: true,
    pastaEntradaId: cfg.PASTA_ENTRADA_ID,
    lidos: lidos,
    enfileirados: enfileirados,
    duplicados: duplicados
  };
}

function processarFilaWMGJ(limite) {
  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();

  var fila = obterOuCriarAba_(ss, cfg.SHEETS.FILA, [
    "DATA_ENTRADA",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME",
    "TIPO",
    "STATUS",
    "TENTATIVAS",
    "PROXIMA_ACAO",
    "ULTIMO_ERRO",
    "OBSERVACAO"
  ]);

  var memoria = obterOuCriarAba_(ss, cfg.SHEETS.MEMORIA, [
    "DATA_REGISTRO",
    "ORIGEM",
    "ID_ORIGEM",
    "NOME_ARQUIVO",
    "MIME_TYPE",
    "HASH",
    "COMPETENCIA",
    "CATEGORIA",
    "STATUS",
    "RESUMO_AI"
  ]);

  if (!fila || fila.getLastRow() < 2) {
    registrarLogWMGJ_("OK", "processarFilaWMGJ", "AppsScript", "Fila vazia");
    return {
      ok: true,
      etapa: "processarFilaWMGJ",
      processados: 0,
      erros: 0,
      duplicados: 0,
      mensagem: "Fila vazia"
    };
  }

  var dados = fila.getDataRange().getValues();
  var idx = mapearCabecalhoWMGJ_(dados[0]);
  var max = Number(limite) || 20;

  var processados = 0;
  var erros = 0;
  var duplicados = 0;

  for (var i = 1; i < dados.length && processados < max; i++) {
    var linha = dados[i];
    var status = String(linha[idx.STATUS] || "").toUpperCase();
    var idOrigem = String(linha[idx.ID_ORIGEM] || "");

    if (status !== "PENDENTE" && status !== "ERRO_REPROCESSAR") {
      continue;
    }

    if (!idOrigem) {
      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "ERRO_REPROCESSAR",
        TENTATIVAS: Number(linha[idx.TENTATIVAS] || 0) + 1,
        ULTIMO_ERRO: "ID_ORIGEM vazio",
        OBSERVACAO: "Registro de fila sem ID_ORIGEM"
      });
      erros++;
      continue;
    }

    try {
      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "PROCESSANDO",
        ULTIMO_ERRO: ""
      });

      var file = DriveApp.getFileById(idOrigem);
      var hash = gerarHashArquivoWMGJ_(file);

      if (documentoJaProcessadoWMGJ_(idOrigem, hash)) {
        registrarDocumentoMemoriaWMGJ_(memoria, {
          origem: "DRIVE",
          idOrigem: idOrigem,
          nome: file.getName(),
          mimeType: file.getMimeType(),
          hash: hash,
          competencia: "",
          categoria: "outro",
          status: "DUPLICADO",
          resumo: "Arquivo já reconhecido por ID_ORIGEM + HASH"
        });

        atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
          STATUS: "DUPLICADO",
          OBSERVACAO: "ID_ORIGEM + HASH já processados"
        });
        duplicados++;
        continue;
      }

      var texto = extrairTextoBasicoArquivoWMGJ_(file);
      var resultadoIA = classificarDocumentoComIASeDisponivelWMGJ_(texto, file);
      var validacao = validarDocumentoJsonWMGJ_(resultadoIA);

      if (!validacao.ok) {
        atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
          STATUS: "REVISAR_HUMANO",
          TENTATIVAS: Number(linha[idx.TENTATIVAS] || 0) + 1,
          ULTIMO_ERRO: validacao.erro,
          OBSERVACAO: "JSON inválido ou incompleto"
        });
        erros++;
        continue;
      }

      registrarDocumentoMemoriaWMGJ_(memoria, {
        origem: "DRIVE",
        idOrigem: idOrigem,
        nome: file.getName(),
        mimeType: file.getMimeType(),
        hash: hash,
        competencia: validacao.dados.competencia || "",
        categoria: validacao.dados.categoria || "outro",
        status: "PROCESSADO",
        resumo: validacao.dados.resumo_operacional || validacao.dados.descricao || "Processado sem resumo"
      });

      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "PROCESSADO",
        ULTIMO_ERRO: "",
        OBSERVACAO: "Processado e gravado na memória-base"
      });

      processados++;

    } catch (erro) {
      atualizarLinhaFilaWMGJ_(fila, i + 1, idx, {
        STATUS: "ERRO_REPROCESSAR",
        TENTATIVAS: Number(linha[idx.TENTATIVAS] || 0) + 1,
        ULTIMO_ERRO: erro && erro.message ? erro.message : String(erro),
        OBSERVACAO: "Falha isolada; demais itens da fila continuam"
      });
      erros++;
    }
  }

  var resultado = {
    ok: true,
    etapa: "processarFilaWMGJ",
    processados: processados,
    erros: erros,
    duplicados: duplicados
  };

  registrarLogWMGJ_("OK", "processarFilaWMGJ", "AppsScript", JSON.stringify(resultado));
  return resultado;
}

function validarDocumentoJsonWMGJ_(entrada) {
  var dados = entrada;

  if (typeof entrada === "string") {
    var limpo = limparRespostaJsonWMGJ_(entrada);
    try {
      dados = JSON.parse(limpo);
    } catch (erro) {
      return {
        ok: false,
        erro: "JSON_PARSE_ERROR: " + (erro.message || String(erro)),
        bruto: entrada
      };
    }
  }

  if (!dados || typeof dados !== "object") {
    return {
      ok: false,
      erro: "JSON_NAO_OBJETO",
      bruto: entrada
    };
  }

  var categorias = {
    financeiro: true,
    produtividade: true,
    contrato: true,
    glosa: true,
    relatorio: true,
    cadastro: true,
    outro: true
  };

  var categoria = String(dados.categoria || "").toLowerCase();
  if (!categoria || !categorias[categoria]) {
    return {
      ok: false,
      erro: "CATEGORIA_INVALIDA",
      dados: dados
    };
  }

  var confianca = Number(dados.confianca);
  if (isNaN(confianca)) {
    dados.confianca = 0;
    confianca = 0;
  }

  if (confianca < 0.6) {
    return {
      ok: false,
      erro: "CONFIANCA_BAIXA",
      dados: dados
    };
  }

  return {
    ok: true,
    dados: dados
  };
}

function limparRespostaJsonWMGJ_(texto) {
  var t = String(texto || "").trim();

  t = t
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  var inicio = t.indexOf("{");
  var fim = t.lastIndexOf("}");

  if (inicio >= 0 && fim > inicio) {
    return t.substring(inicio, fim + 1);
  }

  return t;
}

function classificarDocumentoComIASeDisponivelWMGJ_(texto, file) {
  if (typeof chamarGeminiWMGJ === "function") {
    return chamarGeminiWMGJ(montarPromptDocumentoWMGJ_(texto, file));
  }

  return classificarDocumentoFallbackWMGJ_(texto, file);
}

function montarPromptDocumentoWMGJ_(texto, file) {
  return [
    "Você é o agente operacional WMGJ.",
    "Retorne APENAS JSON válido com:",
    "categoria, tipo_documento, data_documento, competencia, valor_total, atendimentos, nome_prestador, cnpj, medico, paciente, descricao, pendencias, nivel_risco, resumo_operacional, destino_drive, aba_planilha_destino e confianca.",
    "Nome do arquivo: " + file.getName(),
    "Documento:",
    String(texto || "").slice(0, 12000)
  ].join("\n");
}

function classificarDocumentoFallbackWMGJ_(texto, file) {
  var t = String(texto || "").toLowerCase();
  var nome = file ? file.getName() : "";
  var categoria = "outro";

  if (t.indexOf("nota fiscal") >= 0 || t.indexOf("nf-e") >= 0 || t.indexOf("valor") >= 0 || t.indexOf("r$") >= 0) {
    categoria = "financeiro";
  }

  if (t.indexOf("atendimento") >= 0 || t.indexOf("consulta") >= 0 || t.indexOf("ecocardiograma") >= 0) {
    categoria = "produtividade";
  }

  if (t.indexOf("contrato") >= 0) {
    categoria = "contrato";
  }

  if (t.indexOf("glosa") >= 0) {
    categoria = "glosa";
  }

  return {
    categoria: categoria,
    tipo_documento: "fallback_sem_ia",
    competencia: extrairCompetenciaTextoWMGJ_(texto) || "",
    valor_total: extrairValorTextoWMGJ_(texto) || 0,
    atendimentos: extrairAtendimentosTextoWMGJ_(texto) || 0,
    descricao: "Classificação local sem IA para " + nome,
    pendencias: categoria === "outro" ? ["Revisar manualmente"] : [],
    nivel_risco: categoria === "outro" ? "medio" : "baixo",
    resumo_operacional: "Documento classificado por fallback local",
    destino_drive: "",
    aba_planilha_destino: "14_MEMORIA_BASE_DOCUMENTOS",
    confianca: categoria === "outro" ? 0.6 : 0.75
  };
}

function extrairTextoBasicoArquivoWMGJ_(file) {
  var mime = file.getMimeType();

  if (mime === MimeType.GOOGLE_DOCS) {
    return DocumentApp.openById(file.getId()).getBody().getText();
  }

  if (mime === MimeType.PLAIN_TEXT || mime.indexOf("text/") === 0 || mime.indexOf("csv") >= 0) {
    return file.getBlob().getDataAsString("UTF-8");
  }

  return "NOME_ARQUIVO: " + file.getName() + "\nMIME_TYPE: " + mime + "\nID: " + file.getId();
}

function gerarHashArquivoWMGJ_(file) {
  var base = [
    file.getId(),
    file.getName(),
    file.getSize(),
    file.getLastUpdated().getTime()
  ].join("|");

  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    base,
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte) {
    var valor = byte < 0 ? byte + 256 : byte;
    var hex = valor.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

function montarChaveDocumentoWMGJ_(idOrigem, hash) {
  return String(idOrigem || "") + "|" + String(hash || "");
}

function carregarControleDocumentosWMGJ_(memoria) {
  var controle = {};

  if (!memoria || memoria.getLastRow() < 2) {
    return controle;
  }

  var dados = memoria.getDataRange().getValues();
  var idx = mapearCabecalhoWMGJ_(dados[0]);

  for (var i = 1; i < dados.length; i++) {
    var id = dados[i][idx.ID_ORIGEM];
    var hash = dados[i][idx.HASH];
    var status = String(dados[i][idx.STATUS] || "").toUpperCase();

    if (id && hash && (status === "PROCESSADO" || status === "DUPLICADO")) {
      controle[montarChaveDocumentoWMGJ_(id, hash)] = true;
    }
  }

  return controle;
}

function carregarIdsFilaWMGJ_(fila) {
  var ids = {};

  if (!fila || fila.getLastRow() < 2) {
    return ids;
  }

  var dados = fila.getDataRange().getValues();
  var idx = mapearCabecalhoWMGJ_(dados[0]);

  for (var i = 1; i < dados.length; i++) {
    var id = dados[i][idx.ID_ORIGEM];
    if (id) {
      ids[String(id)] = true;
    }
  }

  return ids;
}

function documentoJaProcessadoWMGJ_(idOrigem, hash) {
  var cfg = getConfigWMGJ_();
  var memoria = getPlanilha().getSheetByName(cfg.SHEETS.MEMORIA);
  var controle = carregarControleDocumentosWMGJ_(memoria);
  return !!controle[montarChaveDocumentoWMGJ_(idOrigem, hash)];
}

function registrarDocumentoMemoriaWMGJ_(memoria, doc) {
  memoria.appendRow([
    new Date(),
    doc.origem || "",
    doc.idOrigem || "",
    doc.nome || "",
    doc.mimeType || "",
    doc.hash || "",
    doc.competencia || "",
    doc.categoria || "",
    doc.status || "",
    doc.resumo || ""
  ]);
}

function atualizarLinhaFilaWMGJ_(fila, rowNumber, idx, campos) {
  Object.keys(campos).forEach(function(nome) {
    if (idx[nome] === undefined || idx[nome] < 0) {
      return;
    }
    fila.getRange(rowNumber, idx[nome] + 1).setValue(campos[nome]);
  });
}

function mapearCabecalhoWMGJ_(header) {
  var out = {};

  header.forEach(function(nome, i) {
    out[String(nome || "").trim()] = i;
  });

  return out;
}

function limparTestesPipelineWMGJ() {
  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();
  var removidos = {};

  [cfg.SHEETS.FILA, cfg.SHEETS.MEMORIA].forEach(function(nomeAba) {
    var aba = ss.getSheetByName(nomeAba);
    var total = 0;

    if (!aba || aba.getLastRow() < 2) {
      removidos[nomeAba] = 0;
      return;
    }

    var dados = aba.getDataRange().getValues();

    for (var i = dados.length - 1; i >= 1; i--) {
      var linha = dados[i].join(" ");

      if (linha.indexOf("TESTE_PIPELINE_WMGJ") >= 0) {
        aba.deleteRow(i + 1);
        total++;
      }
    }

    removidos[nomeAba] = total;
  });

  var arquivosRemovidos = 0;

  try {
    var pasta = DriveApp.getFolderById(cfg.PASTA_ENTRADA_ID);
    var arquivos = pasta.getFiles();

    while (arquivos.hasNext()) {
      var file = arquivos.next();

      if (file.getName().indexOf("TESTE_PIPELINE_WMGJ") === 0) {
        file.setTrashed(true);
        arquivosRemovidos++;
      }
    }
  } catch (erroDrive) {
    removidos.erroDrive = erroDrive && erroDrive.message ? erroDrive.message : String(erroDrive);
  }

  removidos.ARQUIVOS_DRIVE_TESTE = arquivosRemovidos;

  registrarLogWMGJ_(
    "TESTE_OK",
    "limparTestesPipelineWMGJ",
    "AppsScript",
    JSON.stringify(removidos)
  );

  return {
    ok: true,
    removidos: removidos
  };
}

function criarArquivoTestePipelineWMGJ() {
  var cfg = getConfigWMGJ_();
  var pasta = DriveApp.getFolderById(cfg.PASTA_ENTRADA_ID);
  var nome = "TESTE_PIPELINE_WMGJ_" + new Date().getTime() + ".txt";

  var conteudo = [
    "Documento de teste WMGJ",
    "Categoria: produtividade",
    "Competencia: 2026-05",
    "Atendimentos: 12",
    "Valor: R$ 1.000,00",
    "Observacao: arquivo criado para validar Drive -> Fila -> Memoria-base"
  ].join("\n");

  var arquivo = pasta.createFile(nome, conteudo, MimeType.PLAIN_TEXT);

  registrarLogWMGJ_(
    "TESTE_OK",
    "criarArquivoTestePipelineWMGJ",
    "AppsScript",
    "Arquivo criado: " + arquivo.getName() + " | ID: " + arquivo.getId()
  );

  return {
    ok: true,
    nome: arquivo.getName(),
    id: arquivo.getId(),
    pastaId: cfg.PASTA_ENTRADA_ID
  };
}

function diagnosticarDuplicidadeMemoriaWMGJ() {
  var cfg = getConfigWMGJ_();
  var ss = getPlanilha();
  var memoria = ss.getSheetByName(cfg.SHEETS.MEMORIA);
  var fila = ss.getSheetByName(cfg.SHEETS.FILA);

  var resultado = {
    memoria: [],
    fila: []
  };

  if (memoria && memoria.getLastRow() >= 2) {
    var dadosMemoria = memoria.getDataRange().getValues();
    var idxM = mapearCabecalhoWMGJ_(dadosMemoria[0]);

    for (var i = 1; i < dadosMemoria.length; i++) {
      var nomeM = String(dadosMemoria[i][idxM.NOME_ARQUIVO] || "");

      if (nomeM.indexOf("TESTE_PIPELINE_WMGJ") >= 0) {
        resultado.memoria.push({
          linha: i + 1,
          idOrigem: dadosMemoria[i][idxM.ID_ORIGEM],
          nome: nomeM,
          hash: dadosMemoria[i][idxM.HASH],
          status: dadosMemoria[i][idxM.STATUS]
        });
      }
    }
  }

  if (fila && fila.getLastRow() >= 2) {
    var dadosFila = fila.getDataRange().getValues();
    var idxF = mapearCabecalhoWMGJ_(dadosFila[0]);

    for (var j = 1; j < dadosFila.length; j++) {
      var nomeF = String(dadosFila[j][idxF.NOME] || "");

      if (nomeF.indexOf("TESTE_PIPELINE_WMGJ") >= 0) {
        resultado.fila.push({
          linha: j + 1,
          idOrigem: dadosFila[j][idxF.ID_ORIGEM],
          nome: nomeF,
          status: dadosFila[j][idxF.STATUS],
          observacao: dadosFila[j][idxF.OBSERVACAO]
        });
      }
    }
  }

  registrarLogWMGJ_(
    "DIAGNOSTICO",
    "diagnosticarDuplicidadeMemoriaWMGJ",
    "AppsScript",
    JSON.stringify(resultado)
  );

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function extrairCompetenciaTextoWMGJ_(texto) {
  var t = String(texto || "");
  var m = t.match(/(20\d{2})[-\/](0[1-9]|1[0-2])/);

  if (m) {
    return m[1] + "-" + m[2];
  }

  return "";
}

function extrairValorTextoWMGJ_(texto) {
  var t = String(texto || "");
  var m = t.match(/R\$\s*([0-9\.]+,[0-9]{2})/i);

  if (!m) {
    return 0;
  }

  return Number(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

function extrairAtendimentosTextoWMGJ_(texto) {
  var t = String(texto || "");
  var m = t.match(/(\d+)\s+atendimentos?/i);

  if (!m) {
    return 0;
  }

  return Number(m[1]) || 0;
}

function testarControleConfiabilidadeWMGJ() {
  var prep = prepararPipelineConfiavelWMGJ();
  var proc = processarFilaWMGJ(5);

  return {
    ok: true,
    preparar: prep,
    processar: proc
  };
}
