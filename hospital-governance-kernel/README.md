# WMGJ Hospital Governance Kernel

> **Owner:** WMGJ Governance Kernel Owners — Backend, Platform, Diretor Técnico e Controlador
> **Status:** `CONTROLLED_DRAFT` — homologação sintética; não implantado e não autorizado para uso clínico
> **Effective:** 2026-08-26 para validação documental/local com `DRY_RUN=true`
> **Review:** antes de deploy, mudança de contrato/finalidade e no mínimo trimestralmente
> **Supersedes:** README não controlado anterior do kernel

**Versão:** `1.0.0-hml`
**Projeto-alvo:** Apps Script standalone `WMGJ_HOSPITAL_GOVERNANCE_KERNEL_HML`
**Estado:** código versionado para homologação; sem deploy, sem gatilhos, sem dados reais e sem prontidão clínica.

Este projeto é um núcleo separado do Apps Script operacional atual. Ele profissionaliza a captura de eventos, a auditoria, a aprovação e a evolução de algoritmos sem substituir o pipeline WMGJ em produção.

## Regra-mãe

> Nada fecha sem evidência. Nada crítico é aprovado pela IA. Nada é promovido sem teste, revisão humana e possibilidade de rollback.

## Limites arquiteturais

- O Apps Script é adaptador, outbox e orquestrador de lote curto.
- O Firestore/backend é o limite transacional e a fonte canônica de auditoria.
- A planilha local não é tratada como trilha imutável; armazena somente metadados, referências e recibos.
- Aprovação clínica, financeira, contratual ou de relatório final deve ocorrer em backend autenticado; o candidato atual ainda não demonstra esse ledger. `onEdit` e checkbox não provam a identidade do aprovador.
- `CLINICAL_MODE=disabled`, `KILL_SWITCH=true` e `DRY_RUN=true` são os padrões iniciais.
- Homologação aceita somente dados sintéticos e a organização `wmgj-sandbox`.
- Deploy de código nunca instala gatilhos nem executa ingestão.
- Compatibilidade com o backend do PR #13 permanece bloqueada para dispatch real até os testes do contrato fixado em commit.
- Risco do sistema de IA, risco do caso e severidade do achado são dimensões distintas.

## Fluxo

```text
fonte preparada
  -> referência + versão + hash
  -> outbox local
  -> evento assinado
  -> backend canônico do PR #13
  -> Firestore + auditoria
  -> regras/IA opcional via FastAPI
  -> decisão humana autenticada
  -> projeção/dashboard
```

O processamento-alvo é `at-least-once` com efeitos idempotentes. A mesma chave e a mesma mutação canônica (`semanticHash`) podem retornar duplicidade segura; a mesma chave com mutação semanticamente diferente gera `IDEMPOTENCY_COLLISION` e vai para quarentena. Essa garantia continua bloqueada até o teste integrado do contrato.

## Componentes

- `src/`: projeto Apps Script V8 independente.
- `schemas/`: contratos JSON versionados.
- `tests/`: testes unitários, contratuais e de segurança sem dados reais.
- `api/`: serviço FastAPI stateless para HMAC e OpenAI Responses; não possui credencial nem escrita Firestore.
- `docs/`: plano de governança, arquitetura, ameaças, segurança clínica, runbook e crescimento contínuo.
- `creative/`: briefing visual não clínico; nenhuma mídia é gerada automaticamente.

## Documentos de controle obrigatório

- [`REGULATORY_REGISTER_AND_CONTROL_MATRIX.md`](docs/REGULATORY_REGISTER_AND_CONTROL_MATRIX.md): fontes oficiais, status regulatório/judicial e controles.
- [`CLINICAL_ACTIVATION_SAFETY_CASE.md`](docs/CLINICAL_ACTIVATION_SAFETY_CASE.md): gates que mantêm a ativação clínica bloqueada.
- [`DATA_PROTECTION_OPERATING_MODEL.md`](docs/DATA_PROTECTION_OPERATING_MODEL.md): ROPA, RIPD, agentes, minimização, retenção e incidentes.
- [`APPROVAL_RACI_AND_AUTHORITY_MATRIX.md`](docs/APPROVAL_RACI_AND_AUTHORITY_MATRIX.md): papéis canônicos, alçadas, quórum e segregação.
- [`PR13_CONTRACT_COMPATIBILITY.md`](docs/PR13_CONTRACT_COMPATIBILITY.md): commit-alvo, crosswalk, limitações e testes consumer-driven.
- [`SLO_ERROR_BUDGET_DR.md`](docs/SLO_ERROR_BUDGET_DR.md): SLIs, objetivos provisórios, abort thresholds e recuperação.
- [`RELEASE_EVIDENCE_20260826.md`](docs/RELEASE_EVIDENCE_20260826.md): testes locais, escopo consolidado e gates ainda bloqueados.

Ausência, expiração ou falha de qualquer gate mantém `KILL_SWITCH=true`, `DRY_RUN=true` e `CLINICAL_MODE=disabled`.

## Entrypoints públicos

```javascript
HKGK_setupStaging();
HKGK_diagnostics();
HKGK_generateSyntheticFixtures();
HKGK_scanInboxTick();
HKGK_dispatchTick();
HKGK_watchdogTick();
HKGK_reconcileDaily();
HKGK_installStagingTriggers();
HKGK_pause('motivo');
HKGK_resume('motivo');
```

`HKGK_setupStaging()` cria uma planilha exclusiva na mesma conta Google e grava seu ID em Script Properties. Não lê nem modifica a planilha-mestre WMGJ.

## Propriedades do Apps Script

Configuração sem segredo:

```text
HKGK_ENV=staging
HKGK_ORG_ID=wmgj-sandbox
HKGK_DRY_RUN=true
HKGK_KILL_SWITCH=true
HKGK_CLINICAL_MODE=disabled
HKGK_INGEST_URL=https://<cloud-function-do-pr-13>
HKGK_INGEST_KEY_ID=<identificador-da-chave>
HKGK_DATA_SPREADSHEET_ID=<criado-pelo-setup>
```

Segredo de homologação, somente quando o backend estiver pronto:

```text
HKGK_INGEST_HMAC_SECRET=<segredo-longo>
```

O segredo não pode aparecer em código, planilha, log ou artefato de CI. Em produção, a migração recomendada é para gerenciador de segredos e rotação `current/previous` no backend.

## Validação local

```bash
cd hospital-governance-kernel
npm test
npm run audit

cd api
uv run pytest
```

## Implantação controlada

1. Revisar o PR draft e os relatórios de teste.
2. Criar um Apps Script standalone na mesma conta, com outro `scriptId`.
3. Configurar `HGK_APPS_SCRIPT_ID_HML`, `HKGK_CLASPRC_JSON_HML` e `WMGJ_OPERATIONAL_SCRIPT_ID` no ambiente GitHub `governance-kernel-staging`.
4. Executar manualmente o workflow de staging.
5. Rodar `HKGK_setupStaging()` e `HKGK_diagnostics()`.
6. Manter `KILL_SWITCH=true` até a aprovação dos testes.
7. Usar somente fixtures sintéticas em homologação.
8. Liberar gatilhos em ação manual separada.

Produção não clínica exige nova aprovação, projeto/segredos próprios, Firebase homologado, contrato PR #13 comprovado, SLO/DR ensaiado, testes de isolamento e canário explícito. Qualquer finalidade clínica exige, adicionalmente, o safety case completo e autorização institucional específica; este repositório não afirma que tais condições foram atendidas.
