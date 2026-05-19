/**
 * WMGJ - Automação operacional Apps Script
 *
 * Objetivo:
 * - Criar uma camada de execução automática sobre a V3 estável.
 * - Não alterar o motor V3.
 * - Permitir instalação de gatilho temporal pelo próprio Apps Script.
 *
 * Fluxo automático:
 * prepararPipelineConfiavelWMGJ_V3 -> processarFilaWMGJ_V3
 */

var WMGJ_AUTOMACAO_APPSCRIPT_VERSAO = 'v1.0.2-automacao-appscript-controlada';

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

    if (typeof registrarLogWMGJ_ === 'function') {
      registrarLogWMGJ_('OK', 'executarAutomacaoOperacionalWMGJ', 'AppsScript', JSON.stringify(resultado));
    }

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

    if (typeof registrarLogWMGJ_ === 'function') {
      registrarLogWMGJ_('ERRO', 'executarAutomacaoOperacionalWMGJ', 'AppsScript', JSON.stringify(falha));
    }

    return falha;
  }
}

/**
 * Instala gatilho temporal controlado.
 * Padrão: a cada 15 minutos.
 */
function instalarGatilhoAutomacaoWMGJ() {
  removerGatilhosAutomacaoWMGJ_();

  ScriptApp.newTrigger('executarAutomacaoOperacionalWMGJ')
    .timeBased()
    .everyMinutes(15)
    .create();

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'instalarGatilhoAutomacaoWMGJ',
    frequencia: '15_MINUTOS',
    instaladoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);

  if (typeof registrarLogWMGJ_ === 'function') {
    registrarLogWMGJ_('OK', 'instalarGatilhoAutomacaoWMGJ', 'AppsScript', JSON.stringify(resultado));
  }

  return resultado;
}

/**
 * Remove gatilhos da automação operacional WMGJ.
 */
function removerGatilhosAutomacaoWMGJ() {
  var removidos = removerGatilhosAutomacaoWMGJ_();

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'removerGatilhosAutomacaoWMGJ',
    removidos: removidos,
    removidoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);

  if (typeof registrarLogWMGJ_ === 'function') {
    registrarLogWMGJ_('OK', 'removerGatilhosAutomacaoWMGJ', 'AppsScript', JSON.stringify(resultado));
  }

  return resultado;
}

function removerGatilhosAutomacaoWMGJ_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === 'executarAutomacaoOperacionalWMGJ') {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });

  return removidos;
}

/**
 * Execução de diagnóstico rápido da automação.
 */
function diagnosticarAutomacaoAppsScriptWMGJ() {
  var triggers = ScriptApp.getProjectTriggers();
  var gatilhosAutomacao = [];

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === 'executarAutomacaoOperacionalWMGJ') {
      gatilhosAutomacao.push({
        funcao: trigger.getHandlerFunction(),
        origem: String(trigger.getTriggerSource && trigger.getTriggerSource() || ''),
        tipoEvento: String(trigger.getEventType && trigger.getEventType() || '')
      });
    }
  });

  var resultado = {
    ok: true,
    versao: WMGJ_AUTOMACAO_APPSCRIPT_VERSAO,
    etapa: 'diagnosticarAutomacaoAppsScriptWMGJ',
    v3Disponivel: typeof processarFilaWMGJ_V3 === 'function',
    gatilhosAutomacao: gatilhosAutomacao,
    totalGatilhosAutomacao: gatilhosAutomacao.length,
    diagnosticadoEm: new Date().toISOString()
  };

  registrarStatusAutomacaoWMGJ_(resultado);
  return resultado;
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
