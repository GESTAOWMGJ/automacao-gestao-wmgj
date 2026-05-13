function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const acao = payload.acao || '';

    switch (acao) {
      case 'conciliar_financeiro':
        conciliacaoCompletaWMGJ();
        break;

      case 'atualizar_financeiro':
        sistemaWMGJCompleto();
        break;

      case 'dashboard':
        atualizarDashboardFinanceiro();
        break;

      default:
        return resposta_({
          ok: false,
          erro: 'ACAO_INVALIDA'
        });
    }

    return resposta_({
      ok: true,
      acao
    });

  } catch (err) {
    return resposta_({
      ok: false,
      erro: err.toString()
    });
  }
}

function resposta_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
