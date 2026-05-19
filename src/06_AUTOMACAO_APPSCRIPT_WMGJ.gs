/**
 * WMGJ - Automação operacional Apps Script consolidada
 *
 * Objetivo:
 * - Criar uma camada única de execução automática sobre a V3 estável.
 * - Não alterar o motor V3.
 * - Evitar gatilhos duplicados de módulos legados.
 * - Auditar e organizar o Apps Script após cada deploy.
 *
 * Fluxo automático:
 * prepararPipelineConfiavelWMGJ_V3 -> processarFilaWMGJ_V3
 */

var WMGJ_AUTOMACAO_APPSCRIPT_VERSAO = 'v1.0.3-auditoria-organizacao-appscript';

var WMGJ_FUNCAO_AUTOMACAO_PRINCIPAL = 'executarAutomacaoOperacionalWMGJ';

var WMGJ_GATILHOS_OPERACIONAIS_OBSOLETOS = {
  jobPrepararPipelineWMGJ: true,
  jobProcessarFilaWMGJ: true,
  jobTesteSaudeWMGJ: true,
  jobRelatorioMensalWMGJ: true
};

/**
 * Executa a automação operacional padrão.
 * Pode ser chamada manualmente ou por gatilho temporal.
 */
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

/**
 * Instala o gatilho temporal oficial.
 * Remove gatilhos duplicados e gatilhos legados do pipeline antes de criar o atual.
 */
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

/**
 * Remove gatilhos da automação operacional WMGJ.
 */
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

/**
 * Auditoria organizacional do Apps Script.
 * Remove duplicidades operacionais conhecidas e preserva gatilhos externos opcionais.
 */
function auditarOrganizarAppsScriptWMGJ(opcoes) {
  opcoes = opcoes || {};

  var triggersAntes = listarTodosGatilhosAppsScriptWMGJ_();
  var problemas = [];
  var removidos = [];
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

  removidos = removerGatilhosAutomacaoWMGJ_({ removerLegados: true, removerPrincipalDuplicado: true });

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

/**
 * Execução de diagnóstico rápido da automação.
 */
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

/**
 * Registra status em aba própria, quando a planilha base estiver disponível.
 */
function registrarStatusAutomacaoWMGJ_(payload) {
  try {
    if (typeof getPlanilha !== 'function' || typeof obterOuCriarAba_ !== 'function') {
      Logger.log(JSON.stringify(payload));
      return;
    }

    var ss = getPlanilha();
    var aba = obterOuCriarAba_(ss, '15_STATUS_AUTOMACAO', [
      'DATA_REGISTRO',
      'VERSAO',
      'ETAPA',
      'OK',
      'RESUMO_JSON'
    ]);

    aba.appendRow([
      new Date(),
      payload.versao || '',
      payload.etapa || '',
      payload.ok === true,
      JSON.stringify(payload)
    ]);

  } catch (erro) {
    Logger.log(JSON.stringify({
      status: 'FALHA_REGISTRAR_STATUS_AUTOMACAO',
      erro: erro && erro.message ? erro.message : String(erro),
      payload: payload
    }));
  }
}
