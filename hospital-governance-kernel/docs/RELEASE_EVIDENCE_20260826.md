# Evidência de release candidate — 26/08/2026

> **Owner:** WMGJ Governance Kernel Owners — Backend, Platform, Diretor Técnico e Controlador
> **Status:** `CONTROLLED_DRAFT` — candidato local, sem publicação ou deploy
> **Effective:** somente validação sintética em staging com `DRY_RUN=true`
> **Review:** antes de publicação, deploy, mudança de finalidade ou uso de dado real
> **Supersedes:** evidência local do commit-base `1ace287`

## Escopo consolidado

- Apps Script standalone e planilha de staging marcada, sem acesso automático à planilha operacional;
- contrato Firestore com CAS, colisão idempotente, receipt forte e hashes verificáveis;
- FastAPI stateless com entrada agregada fechada e Structured Outputs;
- dashboard com cobertura, truncamento, frescor e saúde explícitos;
- documentos de segurança, privacidade, regulação, RACI, SLO/DR e crescimento controlado;
- preflight PixVerse exclusivamente sintético, sem geração ou consumo de créditos.

## Evidência local aprovada

| Gate | Resultado |
|---|---:|
| Apps Script/kernel | 31/31 testes; auditoria estática sem warning ou erro |
| FastAPI/OpenAI adapter | 36/36 testes; upstream ativo integralmente simulado |
| Firestore Functions | 15/15 testes; TypeScript build aprovado |
| Dependências FastAPI | lock offline válido; 47 pacotes compatíveis |
| Dependências Rules | lock reproduzível com `rules-unit-testing` 5.0.2 + Firebase 12.18.0 |
| JSON/YAML/diff | parse e `git diff --check` aprovados |
| Segredos | nenhum literal de chave privada, OpenAI, Google ou AWS nos arquivos alterados |

## Gates ainda bloqueados

1. executar a suíte das Security Rules no Firestore Emulator; o download do binário/JAR foi bloqueado pela política de rede desta sessão;
2. implementar state store durável de `aggregateVersion` no bridge Drive antes de dual write;
3. provar replay distribuído por nonce, rotação/revogação por `keyId` e autorização por `facilityId`;
4. criar projeto, Apps Script e identidades de staging separados, configurar segredos e executar teste integrado fixado em commit;
5. concluir ROPA/RIPD, ledger de aprovação autenticado e safety case antes de qualquer dado real ou finalidade clínica;
6. obter autorização explícita antes de publicar em repositório público, fazer deploy FastAPI/Firebase/Apps Script ou gerar mídia paga.

Falha ou ausência de qualquer gate mantém:

```text
HKGK_ENV=staging
HKGK_ORG_ID=wmgj-sandbox
HKGK_DRY_RUN=true
HKGK_KILL_SWITCH=true
HKGK_CLINICAL_MODE=disabled
```
