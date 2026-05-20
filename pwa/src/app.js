const ENDPOINT = localStorage.getItem('WMGJ_ENDPOINT') || '';

const state = {
  competencia: new Date().toISOString().slice(0, 7),
  ultimaAtualizacao: null
};

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function fallbackResumo() {
  return {
    ok: true,
    origem: 'fallback-local',
    competencia: state.competencia,
    receita_emitida: 0,
    recebido: 0,
    em_aberto: 0,
    pendencias: 0,
    status: 'Endpoint ainda nao configurado. PWA instalavel pronta para contrato operacional.'
  };
}

async function carregarResumo() {
  if (!ENDPOINT) return fallbackResumo();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comando: 'pwa_status', competencia: state.competencia })
  });

  if (!response.ok) throw new Error('Falha HTTP ' + response.status);
  return response.json();
}

async function atualizar() {
  const status = document.getElementById('status');
  status.textContent = 'Atualizando...';

  try {
    const data = await carregarResumo();
    setText('receita', formatBRL(data.receita_emitida));
    setText('recebido', formatBRL(data.recebido));
    setText('aberto', formatBRL(data.em_aberto));
    setText('pendencias', String(data.pendencias || 0));
    state.ultimaAtualizacao = new Date();
    status.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    status.textContent = 'Erro ao atualizar: ' + err.message;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

document.getElementById('atualizar').addEventListener('click', atualizar);
atualizar();
