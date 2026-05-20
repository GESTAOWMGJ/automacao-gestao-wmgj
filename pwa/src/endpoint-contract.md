# Contrato do endpoint PWA WMGJ

## Requisicao

Metodo: POST

Corpo JSON:

```json
{
  "comando": "pwa_status",
  "competencia": "2026-05"
}
```

## Resposta esperada

```json
{
  "ok": true,
  "competencia": "2026-05",
  "receita_emitida": 0,
  "recebido": 0,
  "em_aberto": 0,
  "pendencias": 0,
  "ultima_atualizacao": "2026-05-20T13:55:00-03:00",
  "origem": "WMGJ_BASE_MESTRE_OPERACIONAL_FINANCEIRA"
}
```

## Regras de auditoria

- O PWA deve iniciar em modo somente leitura.
- Toda resposta deve indicar competencia, origem e timestamp.
- Dados financeiros devem vir de rotina consolidada, nunca de soma visual manual.
- Edicao pelo app fica bloqueada ate existir controle de usuario, permissao e log antes/depois.
