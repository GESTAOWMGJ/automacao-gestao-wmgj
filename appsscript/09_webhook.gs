function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const resultado = executarComandoWMGJ(payload);
    return responderJsonWMGJ(resultado);
  } catch (erro) {
    return responderJsonWMGJ({
      ok: false,
      erro: erro.message || String(erro),
      etapa: 'doPost'
    });
  }
}

function executarComandoWMGJ(payload) {
  const comando = payload.comando;

  if (comando === 'status') return obterStatusWMGJ();
  if (comando === 'runWMGJ') return runWMGJ();
  if (comando === 'teste_execucao') return testarExecucaoWMGJ(payload);
  if (comando === 'conciliar') return conciliacaoCompletaWMGJ();

  return { ok: false, erro: 'Comando não reconhecido', comando };
}

function obterStatusWMGJ() {
  return {
    ok: true,
    status: 'ONLINE',
    sistema: 'WMGJ',
    data: new Date().toISOString()
  };
}
