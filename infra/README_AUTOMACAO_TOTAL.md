# WMGJ — Automação Total

## Arquitetura

ChatGPT -> Webhook Apps Script -> Google Sheets

## Componentes

- GitHub como source of truth
- CLASP para sincronização
- Apps Script Web App para execução
- Google Sheets como banco operacional

## Deploy

### Instalar CLASP

npm install -g @google/clasp

### Login

clasp login

### Clonar script

clasp clone SEU_SCRIPT_ID

### Push

clasp push

## Web App

Deploy:
- Executar como: você
- Acesso: qualquer pessoa com o link

## Endpoint

POST:

{
  "acao":"conciliar_financeiro",
  "competencia":"2026-05"
}

## Fluxos

- atualizar financeiro
- conciliar
- gerar dashboard
- validar NFS
- gerar pendências
