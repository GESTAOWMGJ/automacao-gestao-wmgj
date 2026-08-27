# Runbook de homologação, incidente e rollback

> **Owner:** Platform/SRE Owner e Incident Commander
> **Status:** `CONTROLLED_DRAFT` — comandos limitados a staging sintético; não autoriza deploy nem uso clínico
> **Effective:** 2026-08-26 para preparação e exercício local/manual
> **Review:** antes de cada execução, após incidente/exercício e no mínimo mensalmente durante staging
> **Supersedes:** runbook resumido anterior deste kernel

## Limites atuais

```text
ENV=staging
ORG=wmgj-sandbox
DRY_RUN=true
KILL_SWITCH=true
CLINICAL_MODE=disabled
DATA=synthetic_only
LIVE_DISPATCH=blocked
```

Nenhuma etapa publica, cria projeto, instala segredo, habilita faturamento, toca a planilha-mestre ou executa produção sem autorização separada. O PR permanece draft.

## Gates antes de qualquer execução manual

1. Commit e conteúdo revisados por backend, frontend, auditoria e segurança.
2. Testes Node/Python e auditoria estática verdes no commit exato.
3. Contrato PR #13 fixado e limitações registradas em [`PR13_CONTRACT_COMPATIBILITY.md`](PR13_CONTRACT_COMPATIBILITY.md).
4. Projeto Firebase de homologação separado; `wmgj-sandbox` bootstrapado e isolamento negativo testado.
5. FastAPI, se usado, em `dry-run`, sem dado real e com segredo exclusivo de staging.
6. Apps Script standalone com `scriptId` próprio; nunca o projeto operacional WMGJ.
7. `HGK_APPS_SCRIPT_ID_HML` e credenciais isolados; deploy não instala gatilhos.
8. RACI, owner da janela, Incident Commander e canal de escalonamento definidos.
9. Baseline/abort thresholds e restore plan definidos conforme [`SLO_ERROR_BUDGET_DR.md`](SLO_ERROR_BUDGET_DR.md).
10. `CLINICAL_MODE=disabled`; nenhum gate clínico pode ser inferido de teste sintético.

## Sequência segura de staging

### 1. Preparar sem executar ingestão

```javascript
HKGK_setupStaging();
HKGK_diagnostics();
HKGK_listOwnedTriggers();
```

Aceitar somente se:

- `env=staging`;
- `orgId=wmgj-sandbox`;
- `dryRun=true`;
- `killSwitch=true`;
- `clinicalMode=disabled`;
- planilha exclusiva criada/validada;
- nenhum trigger operacional estranho ao projeto.

### 2. Gerar e preparar fixture

```javascript
HKGK_generateSyntheticFixtures();
HKGK_scanInboxTick();
```

Inspecionar outbox, hash, idempotency key, sensibilidade, `synthetic=true` e ausência de identificador/segredo. Não liberar o kill switch se a evidência não estiver íntegra.

### 3. Exercitar dispatch somente dry-run

Registrar previamente `runId`, commit, config hash, owner e janela. Então:

```javascript
HKGK_resume('canario sintetico dry-run aprovado: <changeId>');
HKGK_dispatchTick();
HKGK_reconcileDaily();
HKGK_pause('fim do canario sintetico: <changeId>');
```

`HKGK_resume()` não é aprovação institucional: ele apenas altera a chave local. O change/approval ledger precisa existir no backend ou registro controlado separado.

### 4. Gatilhos, apenas em ação manual separada

```javascript
HKGK_installStagingTriggers();
HKGK_listOwnedTriggers();
```

Instalar somente depois de exercício manual verde. Ao final da janela, remover e verificar:

```javascript
HKGK_pause('encerramento da janela: <changeId>');
HKGK_removeOwnedTriggers();
HKGK_listOwnedTriggers();
```

O resultado final deve mostrar zero gatilho `HKGK_` quando a janela exigir hard stop.

## Soft pause e hard stop

| Ação | Comando | Efeito esperado | Uso |
|---|---|---|---|
| soft pause | `HKGK_pause('motivo')` | ativa kill switch e bloqueia dispatch; scan/watchdog podem continuar | degradação controlada sem risco de ampliar exposição |
| hard stop | `HKGK_pause(...)` + `HKGK_removeOwnedTriggers()` | interrompe handlers do kernel; preserva filas/evidência | P0/P1, dado indevido, cross-tenant, versão desconhecida |
| resume | `HKGK_resume('approval/changeId')` | libera somente se configuração local passar validação | apenas após go/no-go e em staging dry-run |

Se a semântica observada divergir, tratar como incidente e não presumir funcionamento pelo nome do comando.

## Severidade

| Nível | Exemplos | Resposta |
|---|---|---|
| P0 | dado clínico/PII aceito; cross-tenant/facility; decisão clínica/fechamento automático; credencial comprometida | hard stop imediato; Diretor Técnico/Controlador/Segurança; preservar evidência |
| P1 | colisão idempotente silenciosa; hash divergente; efeito duplicado; audit trail inconsistente; rollback indisponível | pausar, isolar domínio, reconciliar e decidir restauração |
| P2 | latência/backlog/DLQ acima do SLO sem perda de integridade | reduzir rollout, corrigir e repetir janela |
| P3 | defeito documental/visual sem impacto em autoridade ou dado | registrar e corrigir em ciclo controlado |

Tempos de acknowledge/contenção estão em [`SLO_ERROR_BUDGET_DR.md`](SLO_ERROR_BUDGET_DR.md); regra legal, assistencial ou contratual mais curta prevalece.

## Fluxo de incidente

```text
DETECT -> DECLARE -> CONTAIN -> PRESERVE -> SCOPE
-> ASSESS SAFETY/PRIVACY -> NOTIFY WHEN APPLICABLE
-> ERADICATE -> RECOVER -> VERIFY -> POSTMORTEM -> REAUTHORIZE
```

Registrar:

```text
incidentId, severity, detectedAt, declaredAt, commander,
environment, org/facility, commit, configHash, algorithmVersion,
affectedEvents/cases, dataCategories, timeline, evidenceHashes,
containment, regulatoryAssessment, notifications, rollback,
observedRto/Rpo, rootCause, correctiveActions, approvals
```

`IDEMPOTENCY_COLLISION`, divergência de hash, lease vencido, assinatura inválida, replay, acesso cross-tenant/facility, dado indevido, versão desconhecida e tentativa de decisão proibida são eventos investigáveis. Bloquear item e não avançar cursor.

Quando houver dado pessoal, o controlador decide comunicação conforme LGPD e Resolução CD/ANPD 15/2024, com Encarregado/Jurídico. Quando houver risco à segurança do paciente ou uso médico de IA, acionar Diretor Técnico e instâncias competentes conforme norma vigente. O sistema não decide a notificação.

## Rollback por componente

| Componente | Contenção | Restauração | Verificação obrigatória |
|---|---|---|---|
| Apps Script | kill switch + remover somente triggers `HKGK_` | última versão imutável aprovada | funções/versão, config, zero trigger indevido |
| outbox/DLQ | suspender claim/dispatch | não apagar; reprocessar somente com aprovação | hash, lease, tentativa, receipt e reconciliação |
| backend/Functions | retirar versão/canário afetado | baseline aprovado | health, contrato, idempotência, tenant tests |
| Firestore Rules/índices | bloquear mudança afetada | versão aprovada e testada em emulator | testes negativos e acesso privilegiado |
| FastAPI/model | modo dry-run/desabilitar rota/chave | modelo/config anteriores permitidos | structured output, custo, timeout e no-store |
| algoritmo/regra/prompt | retirar versão ativa | `rollbackVersion` registrada | replay do conjunto congelado e canário |
| dashboard | marcar `OFFLINE/STALE` | última projeção compatível | timestamp, fonte, dado ausente e drill-down |

Rollback de código não desfaz efeito externo. Pagamento, envio, glosa, comunicação, alteração de prontuário ou decisão final são proibidos neste kernel; se algum ocorrer, tratar como P0 e executar reparação humana específica.

## Validação pós-rollback

1. confirmar kill switch e inventário de triggers;
2. confirmar commit/config/model/rule version ativos;
3. reconciliar outbox, integration event, entidade, audit event e receipt;
4. verificar ausência de escrita no sistema WMGJ operacional;
5. executar testes negativos de tenant/facility/PII;
6. medir RTO/RPO real;
7. confirmar backlog e dead letters preservados;
8. registrar decisão de manter bloqueado ou retomar;
9. obter nova aprovação; não reutilizar aprovação do snapshot anterior.

## Gate de retomada

Retomar somente quando causa, alcance e exposição estiverem compreendidos; ações corretivas e testes estiverem completos; SLO/error budget permitirem; credenciais estiverem seguras; reconciliação estiver íntegra; e owners humano, técnico, segurança, privacidade e clínico aplicável aprovarem o novo snapshot.

Na dúvida, permanecer pausado. Produção e ativação clínica não são etapas deste runbook.
