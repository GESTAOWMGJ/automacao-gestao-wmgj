function runWMGJ() {
  try {
    registrarLogWMGJ('RUN_WMGJ', 'INICIO', 'Pipeline iniciado');

    processarGmailWMGJ();

    // ETAPAS FINANCEIRAS (já existentes no projeto)
    if (typeof importarArquivosFinanceirosPDFExcel === 'function') {
      importarArquivosFinanceirosPDFExcel();
    }

    if (typeof classificarLancamentosFinanceiros === 'function') {
      classificarLancamentosFinanceiros();
    }

    // IA AUTÔNOMA: classifica desconhecidos e analisa divergências.
    if (typeof executarIAAutonomaWMGJ === 'function') {
      executarIAAutonomaWMGJ();
    }

    if (typeof atualizarResultadoFinanceiro === 'function') {
      atualizarResultadoFinanceiro();
    }

    if (typeof conciliacaoCompletaWMGJ === 'function') {
      conciliacaoCompletaWMGJ();
    }

    // Segunda passada de IA após conciliação, para analisar divergências recém-geradas.
    if (typeof analisarConciliacaoComIAWMGJ === 'function') {
      analisarConciliacaoComIAWMGJ();
    }

    if (typeof atualizarDashboardFinanceiro === 'function') {
      atualizarDashboardFinanceiro();
    }

    registrarLogWMGJ('RUN_WMGJ', 'FIM', 'Pipeline finalizado');

    return {
      ok: true,
      mensagem: 'WMGJ executado com sucesso'
    };

  } catch (erro) {
    registrarLogWMGJ('RUN_WMGJ', 'ERRO', erro.message);

    return {
      ok: false,
      erro: erro.message
    };
  }
}
