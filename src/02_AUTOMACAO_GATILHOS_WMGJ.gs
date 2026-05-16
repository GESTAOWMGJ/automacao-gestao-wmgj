/**
 * WMGJ — Automação de gatilhos Apps Script
 *
 * Execute UMA vez no editor do Apps Script:
 *
 *   instalarAutomacaoWMGJ()
 *
 * Isso cria gatilhos recorrentes para:
 * - preparar/enfileirar arquivos da pasta de entrada;
 * - processar fila em lotes pequenos;
 * - testar webhook internamente;
 * - registrar saúde do pipeline;
 * - manter operação auditável.
 *
 * Não coloque API keys aqui. Humanos adoram vazar segredo em repositório público,
 * mas vamos fingir que aprendemos alguma coisa.
 */

function instalarAutomacaoWMGJ() {
  removerGatilhosWMGJ_();

  ScriptApp.newTrigger("jobPrepararPipelineWMGJ")
    .timeBased()
    .everyMinutes(15)
    .create();

  ScriptApp.newTrigger("jobProcessarFilaWMGJ")
    .timeBased()
    .everyMinutes(15)
    .create();

  ScriptApp.newTrigger("jobTesteSaudeWMGJ")
    .timeBased()
    .everyHours(6)
    .create();

  ScriptApp.newTrigger("jobRelatorioMensalWMGJ")
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();

  registrarLogWMGJ_("OK", "instalarAutomacaoWMGJ", "AppsScript", "Gatilhos automáticos instalados: preparar pipeline, processar fila, teste de saúde e relatório mensal");

  return {
    ok: true,
    mensagem: "Automação WMGJ instalada com sucesso",
    gatilhos: listarGatilhosWMGJ_()
  };
}

function removerAutomacaoWMGJ() {
  var removidos = removerGatilhosWMGJ_();
  registrarLogWMGJ_("OK", "removerAutomacaoWMGJ", "AppsScript", "Gatilhos removidos: " + removidos);
  return {
    ok: true,
    removidos: removidos
  };
}

function reinstalarAutomacaoWMGJ() {
  removerAutomacaoWMGJ();
  return instalarAutomacaoWMGJ();
}

function listarAutomacaoWMGJ() {
  return {
    ok: true,
    gatilhos: listarGatilhosWMGJ_()
  };
}

function jobPrepararPipelineWMGJ() {
  try {
    var resultado = prepararPipelineConfiavelWMGJ();
    registrarLogWMGJ_("OK", "jobPrepararPipelineWMGJ", "Trigger", JSON.stringify(resultado));
    return resultado;
  } catch (erro) {
    registrarLogWMGJ_("ERRO", "jobPrepararPipelineWMGJ", "Trigger", erro && erro.message ? erro.message : String(erro));
    return { ok: false, erro: erro && erro.message ? erro.message : String(erro) };
  }
}

function jobProcessarFilaWMGJ() {
  try {
    var resultado = processarFilaWMGJ(10);
    registrarLogWMGJ_("OK", "jobProcessarFilaWMGJ", "Trigger", JSON.stringify(resultado));
    return resultado;
  } catch (erro) {
    registrarLogWMGJ_("ERRO", "jobProcessarFilaWMGJ", "Trigger", erro && erro.message ? erro.message : String(erro));
    return { ok: false, erro: erro && erro.message ? erro.message : String(erro) };
  }
}

function jobTesteSaudeWMGJ() {
  try {
    var resultado = testarControleConfiabilidadeWMGJ();
    atualizarStatusSaudePipelineWMGJ_(resultado);
    registrarLogWMGJ_("OK", "jobTesteSaudeWMGJ", "Trigger", JSON.stringify(resultado));
    return resultado;
  } catch (erro) {
    atualizarStatusSaudePipelineWMGJ_({ ok: false, erro: erro && erro.message ? erro.message : String(erro) });
    registrarLogWMGJ_("ERRO", "jobTesteSaudeWMGJ", "Trigger", erro && erro.message ? erro.message : String(erro));
    return { ok: false, erro: erro && erro.message ? erro.message : String(erro) };
  }
}

function jobRelatorioMensalWMGJ() {
  try {
    if (typeof runWMGJ === "function") {
      runWMGJ();
    }

    registrarLogWMGJ_("OK", "jobRelatorioMensalWMGJ", "Trigger", "Rotina mensal executada. Conferir painel executivo e relatório PDF.");
    return {
      ok: true,
      mensagem: "Rotina mensal executada"
    };
  } catch (erro) {
    registrarLogWMGJ_("ERRO", "jobRelatorioMensalWMGJ", "Trigger", erro && erro.message ? erro.message : String(erro));
    return { ok: false, erro: erro && erro.message ? erro.message : String(erro) };
  }
}

function atualizarStatusSaudePipelineWMGJ_(resultado) {
  var ss = getPlanilha();
  var aba = obterOuCriarAba_(ss, "13_CONTROLE_PIPELINE", [
    "ETAPA", "COMPONENTE", "STATUS_ATUAL", "EVIDENCIA", "RISCO", "ACAO_CORRETIVA", "RESPONSAVEL", "SLA", "BLOQUEIA_PRODUCAO", "ULTIMA_VALIDACAO", "OBS"
  ]);

  var status = resultado && resultado.ok ? "OK_AUTOMATICO" : "ERRO_AUTOMATICO";
  var obs = resultado && resultado.ok ? JSON.stringify(resultado).slice(0, 500) : String(resultado && resultado.erro ? resultado.erro : "Erro não especificado").slice(0, 500);

  aba.appendRow([
    "AUTO",
    "Saúde do pipeline",
    status,
    "Teste automático recorrente",
    resultado && resultado.ok ? "BAIXO" : "ALTO",
    resultado && resultado.ok ? "Manter monitoramento" : "Verificar Execuções e 10_LOG_AUTOMACAO",
    "TI / Operação",
    "6h",
    resultado && resultado.ok ? "NAO" : "SIM",
    new Date(),
    obs
  ]);
}

function removerGatilhosWMGJ_() {
  var nomes = {
    jobPrepararPipelineWMGJ: true,
    jobProcessarFilaWMGJ: true,
    jobTesteSaudeWMGJ: true,
    jobRelatorioMensalWMGJ: true
  };

  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;

  triggers.forEach(function(trigger) {
    if (nomes[trigger.getHandlerFunction()]) {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });

  return removidos;
}

function listarGatilhosWMGJ_() {
  return ScriptApp.getProjectTriggers().map(function(trigger) {
    return {
      funcao: trigger.getHandlerFunction(),
      origem: String(trigger.getEventType()),
      fonte: String(trigger.getTriggerSource())
    };
  });
}
