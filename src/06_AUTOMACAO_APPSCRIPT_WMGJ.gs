/**
 * WMGJ - Automação operacional Apps Script consolidada
 *
 * Objetivo:
 * - Criar uma camada única de execução automática sobre a V3 estável.
 * - Não alterar o motor V3.
 * - Evitar gatilhos duplicados de módulos legados.
 * - Auditar e organizar o Apps Script após cada deploy.
 * - Gravar status operacional SEMPRE na planilha mestre oficial.
 *
 * Fluxo automático:
 * prepararPipelineConfiavelWMGJ_V3 -> processarFilaWMGJ_V3
 */

var WMGJ_AUTOMACAO_APPSCRIPT_VERSAO = 'v1.0.6-status-forcado-planilha-mestre';
var WMGJ_PLANILHA_MESTRE_ID = '15LgI2U2dtM7vnrxFsiQMPTvBapBDg5ftgGttx7Pw0Cw';

var WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL = 'executarAutomacaoOperacionalWMGJ';

var WMGJ_GATILHOS_OPERACIONAIS_OBSOLETOS = {
  jobPrepararPipelineWMGJ: true,
  jobProcessarFilaWMGJ: true,
  jobTesteSaudeWMGJ: true,
  jobRelatorioMensalWMGJ: true
};

function executarAutomacaoOperacionalWMGJ() {
  var inicio = new Date();

  try {
    if (typeof prepararPipelineConfiavelWMGJ_V3 !== 'function') {
      throw new Error('Função prepararPipelineConfiavelWMGJ_V3 não encontrada. Verifique se a V3 está carregada no Apps Script.');
    }

    if (typeof processarFilaWMGJ_V3 !== 'function') {
      throw new Error('Função processarFilaWMGJ_V3 não encontrada. Verifique se a V3 está carregada no Apps Script.');
    }

    var preparo = prepararPipelineConfiavelWMGJ_V3(100);
    var processamento = processarFilaWMGJ_V3(20);

    var resultado = {
      ok: true,
      versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
      etapa: 'executarAutomacaoOperacionalWMGJ',
      inicio: inicio.toISOString(),
      fim: new Date().toISOString(),
      preparo: preparo,
      processamento: processamento
    };

    registrarStatusAutomacaoWMGJ_(resultado);
    registrarLogAutomacaoWMGJ_('OK', 'executarAutomacaoOperacionalWMGJ', resultado);

    return resultado;

  } catch (erro) {
    var falha = {
      ok: false,
      versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
      etapa: 'executarAutomacaoOperacionalWMGJ',
      inicio: inicio.toISOString(),
      fim: new Date().toISOString(),
      erro: erro && erro.message ? erro.message : String(erro)
    };

    registrarStatusAutomacaoWMGJ_(falha);
    registrarLogAutomacaoWMGJ_('ERRO', 'executarAutomacaoOperacionalWMGJ', falha);

    return falha;
  }
}

function instalarGatilhoAutomacaoWMGJ() {
  var auditoriaAntes = auditarOrganizarAppsScriptWMGJ({ modo: 'PRE_INSTALACAO' });
  var removidos = removerGatilhosAutomacaoWMGJ_({ removerLegados: true, removerPrincipal: true });

  ScriptApp.newTrigger(WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL)
    .timeBased()
    .everyMinutes(15)
    .create();

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'instalarGatilhoAutomacaoWMGJ',
    frequencia: '15_MINUTOS',
    auditoriaAntes: auditoriaAntes,
    removidosAntesInstalacao: removidos,
    instaladoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);
  registrarLogAutomacaoWMGJ_('OK', 'instalarGatilhoAutomacaoWMGJ', resultado);

  return resultado;
}

function removerGatilhosAutomacaoWMGJ() {
  var removidos = removerGatilhosAutomacaoWMGJ_({ removerLegados: true, removerPrincipal: true });

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'removerGatilhosAutomacaoWMGJ',
    removidos: removidos,
    removidoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);
  registrarLogAutomacaoWMGJ_('OK', 'removerGatilhosAutomacaoWMGJ', resultado);

  return resultado;
}

function auditarOrganizarAppsScriptWMGJ(opcoes) {
  opcoes = opcoes || {};

  var triggersAntes = listarTodosGatilhosAppsScriptWMGJ_();
  var problemas = [];
  var contagem = {};

  triggersAntes.forEach(function(t) {
    contagem[t.funcao] = (contagem[t.funcao] || 0) + 1;
  });

  Object.keys(contagem).forEach(function(funcao) {
    if (contagem[funcao] > 1) {
      problemas.push({ tipo: 'GATILHO_DUPLICADO', funcao: funcao, quantidade: contagem[funcao] });
    }
  });

  Object.keys(WMGJ_GATILHOS_OPERACIONAIS_OBSOLETOS).forEach(function(funcaoLegada) {
    if (contagem[funcaoLegada]) {
      problemas.push({ tipo: 'GATILHO_OPERACIONAL_LEGADO', funcao: funcaoLegada, quantidade: contagem[funcaoLegada] });
    }
  });

  var removidos = removerGatilhosAutomacaoWMGJ_({ removerLegados: true, removerPrincipalDuplicado: true });

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'auditarOrganizarAppsScriptWMGJ',
    modo: opcoes.modo || 'MANUAL_OU_CI',
    v3Disponivel: typeof processarFilaWMGJ_V3 === 'function',
    coreDisponivel: typeof getPlanilha === 'function' || typeof getPlanilhaWMGJ_Compat_ === 'function',
    triggersAntes: triggersAntes,
    problemas: problemas,
    removidos: removidos,
    triggersDepois: listarTodosGatilhosAppsScriptWMGJ_(),
    auditadoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);
  registrarLogAutomacaoWMGJ_('OK', 'auditarOrganizarAppsScriptWMGJ', resultado);

  return resultado;
}

function diagnosticarAutomacaoAppsScriptWMGJ() {
  var triggers = listarTodosGatilhosAppsScriptWMGJ_();
  var gatilhosAutomacao = triggers.filter(function(t) {
    return t.funcao === WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL;
  });

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'diagnosticarAutomacaoAppsScriptWMGJ',
    v3Disponivel: typeof processarFilaWMGJ_V3 === 'function',
    gatilhosAutomacao: gatilhosAutomacao,
    totalGatilhosAutomacao: gatilhosAutomacao.length,
    todosGatilhos: triggers,
    diagnosticadoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);
  return resultado;
}

function testarRegistroStatusAutomacaoWMGJ() {
  return validarRegistroStatusAutomacaoWMGJ();
}

function validarRegistroStatusAutomacaoWMGJ() {
  var ss = obterPlanilhaStatusAutomacaoWMGJ_();
  var aba = obterOuCriarAbaStatusAutomacaoWMGJ_(ss);
  var antes = aba.getLastRow();
  var idTeste = 'STATUS_TESTE_' + new Date().getTime();

  if (ss.getId() !== WMGJ_PLANILHA_MESTRE_ID) {
    throw new Error('VALIDACAO_STATUS_FALHOU: planilha de status divergente. Atual=' + ss.getId() + ' Esperada=' + WMGJ_PLANILHA_MESTRE_ID);
  }

  var payload = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'validarRegistroStatusAutomacaoWMGJ',
    idTeste: idTeste,
    spreadsheetId: ss.getId(),
    sheetName: aba.getName(),
    testadoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(payload);
  SpreadsheetApp.flush();

  var depois = aba.getLastRow();
  if (depois <= antes) {
    throw new Error('VALIDACAO_STATUS_FALHOU: appendRow não aumentou a quantidade de linhas em 15_STATUS_AUTOMACAO.');
  }

  var resumo = String(aba.getRange(depois, 5).getDisplayValue() || '');
  if (resumo.indexOf(idTeste) === -1) {
    throw new Error('VALIDACAO_STATUS_FALHOU: última linha não contém o idTeste esperado.');
  }

  return {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'validarRegistroStatusAutomacaoWMGJ',
    spreadsheetId: ss.getId(),
    sheetName: aba.getName(),
    linhaAntes: antes,
    linhaDepois: depois,
    idTeste: idTeste
  };
}

function removerGatilhosAutomacaoWMGJ_(opcoes) {
  opcoes = opcoes || {};

  var triggers = ScriptApp.getProjectTriggers();
  var principalMantido = false;
  var removidos = [];

  triggers.forEach(function(trigger) {
    var funcao = trigger.getHandlerFunction && trigger.getHandlerFunction();
    var deveRemover = false;
    var motivo = '';

    if (opcoes.removerPrincipal && funcao === WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL) {
      deveRemover = true;
      motivo = 'REMOVER_PRINCIPAL_REINSTALACAO';
    }

    if (opcoes.removerPrincipalDuplicado && funcao === WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL) {
      if (principalMantido) {
        deveRemover = true;
        motivo = 'REMOVER_PRINCIPAL_DUPLICADO';
      } else {
        principalMantido = true;
      }
    }

    if (opcoes.removerLegados && WMGJ_GATILHOS_OPERACIONAIS_OBSOLETOS[funcao]) {
      deveRemover = true;
      motivo = 'REMOVER_GATILHO_LEGADO_PIPELINE';
    }

    if (deveRemover) {
      ScriptApp.deleteTrigger(trigger);
      removidos.push({
        funcao: funcao,
        motivo: motivo,
        triggerId: trigger.getUniqueId ? trigger.getUniqueId() : ''
      });
    }
  });

  return removidos;
}

function listarTodosGatilhosAppsScriptWMGJ_() {
  return ScriptApp.getProjectTriggers().map(function(trigger) {
    return {
      funcao: trigger.getHandlerFunction(),
      origem: String(trigger.getTriggerSource && trigger.getTriggerSource() || ''),
      tipoEvento: String(trigger.getEventType && trigger.getEventType() || ''),
      triggerId: trigger.getUniqueId ? trigger.getUniqueId() : ''
    };
  });
}

function registrarLogAutomacaoWMGJ_(status, comando, payload) {
  if (typeof registrarLogWMGJ_ === 'function') {
    registrarLogWMGJ_(status, comando, 'AppsScript', JSON.stringify(payload));
  }
}

function registrarStatusAutomacaoWMGJ_(payload) {
  var ss = obterPlanilhaStatusAutomacaoWMGJ_();
  var aba = obterOuCriarAbaStatusAutomacaoWMGJ_(ss);

  aba.appendRow([
    new Date(),
    payload.versao || WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    payload.etapa || '',
    payload.ok === true,
    JSON.stringify(payload),
    'AppsScript',
    payload.erro || payload.mensagem || payload.idTeste || ''
  ]);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    sheetName: aba.getName(),
    lastRow: aba.getLastRow()
  };
}

function obterPlanilhaStatusAutomacaoWMGJ_() {
  try {
    return SpreadsheetApp.openById(WMGJ_PLANILHA_MESTRE_ID);
  } catch (erroMestre) {
    var idProp = PropertiesService.getScriptProperties().getProperty('WMGJ_SPREADSHEET_ID');
    if (idProp) {
      return SpreadsheetApp.openById(idProp);
    }

    if (typeof getPlanilha === 'function') {
      try {
        var ss1 = getPlanilha();
        if (ss1) return ss1;
      } catch (erroGetPlanilha) {}
    }

    if (typeof getPlanilhaWMGJ_Compat_ === 'function') {
      try {
        var ss2 = getPlanilhaWMGJ_Compat_();
        if (ss2) return ss2;
      } catch (erroCompat) {}
    }

    if (typeof getPlanilhaWMGJ_Automacao_ === 'function') {
      try {
        var ss3 = getPlanilhaWMGJ_Automacao_();
        if (ss3) return ss3;
      } catch (erroAuto) {}
    }

    throw erroMestre;
  }
}

function obterOuCriarAbaStatusAutomacaoWMGJ_(ss) {
  var nome = '15_STATUS_AUTOMACAO';
  var cabecalho = [
    'DATA_REGISTRO',
    'VERSAO',
    'ETAPA',
    'OK',
    'RESUMO_JSON',
    'ORIGEM',
    'OBSERVACAO'
  ];

  var aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
  }

  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.setFrozenRows(1);
  }

  return aba;
}
