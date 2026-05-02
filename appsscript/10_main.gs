function runWMGJ() {
  try {
    registrarLogWMGJ('RUN_WMGJ', 'INICIO', 'Pipeline iniciado');

    processarGmailWMGJ();

    if (typeof importarArquivosFinanceirosPDFExcel === 'function') {
      importarArquivosFinanceirosPDFExcel();
    }

    if (typeof classificarLancamentosFinanceiros === 'function') {
      classificarLancamentosFinanceiros();
    }

    // IA AUTÔNOMA: classifica desconhecidos antes do cálculo.
    if (typeof executarIAAutonomaWMGJ === 'function') {
      executarIAAutonomaWMGJ();
    }

    if (typeof atualizarResultadoFinanceiro === 'function') {
      atualizarResultadoFinanceiro();
    }

    if (typeof conciliacaoCompletaWMGJ === 'function') {
      conciliacaoCompletaWMGJ();
    }

    // IA analisa divergências geradas pela conciliação.
    if (typeof analisarConciliacaoComIAWMGJ === 'function') {
      analisarConciliacaoComIAWMGJ();
    }

    // IA OPERADOR TOTAL: aplica decisões reversíveis e auditáveis.
    if (typeof decidirAutomaticamenteWMGJ === 'function') {
      decidirAutomaticamenteWMGJ();
    }

    if (typeof atualizarResultadoFinanceiro === 'function') {
      atualizarResultadoFinanceiro();
    }

    if (typeof atualizarDashboardFinanceiro === 'function') {
      atualizarDashboardFinanceiro();
    }

    registrarLogWMGJ('RUN_WMGJ', 'FIM', 'Pipeline finalizado com IA operador total');

    return {
      ok: true,
      mensagem: 'WMGJ executado com IA operador total'
    };

  } catch (erro) {
    registrarLogWMGJ('RUN_WMGJ', 'ERRO', erro.message);

    return {
      ok: false,
      erro: erro.message
    };
  }
}
