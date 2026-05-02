function runWMGJ() {
  try {
    registrarLogWMGJ('RUN_WMGJ', 'INICIO', 'Pipeline iniciado');

    processarGmailWMGJ();

    // ETAPAS FINANCEIRAS (já existentes no seu projeto)
    if (typeof importarArquivosFinanceirosPDFExcel === 'function') {
      importarArquivosFinanceirosPDFExcel();
    }

    if (typeof classificarLancamentosFinanceiros === 'function') {
      classificarLancamentosFinanceiros();
    }

    if (typeof atualizarResultadoFinanceiro === 'function') {
      atualizarResultadoFinanceiro();
    }

    if (typeof conciliacaoCompletaWMGJ === 'function') {
      conciliacaoCompletaWMGJ();
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
