# SLO, error budget e recuperacao de desastre

> **Owner:** Platform/SRE Owner, com Backend, Operacao e Security Owners
> **Status:** `PROVISIONAL_FOR_SYNTHETIC_STAGING` — objetivos de validacao, nao SLA de producao nem garantia clinica
> **Effective:** 2026-08-26 para homologacao sintetica
> **Review:** semanal durante staging/canario; mensal apos estabilizacao; imediatamente apos incidente ou mudanca arquitetural
> **Supersedes:** mencoes genericas a “SLO atingido” sem definicao mensuravel

## Escopo

Este documento define como medir confiabilidade e quando interromper mudancas. Metas de producao sao propostas e precisam de aprovacao institucional, capacidade e teste. Nenhum SLO clinico esta aprovado.

```text
CLINICAL_SLO=NOT_DEFINED
CLINICAL_MODE=disabled
STAGING_DATA=synthetic_only
```

## Definicoes

- **SLI:** medida observada, com fonte e formula.
- **SLO:** objetivo para o SLI em uma janela.
- **Error budget:** quantidade de falha tolerada antes de congelar mudancas.
- **OLA:** prazo interno entre equipes, como revisao de pendencia.
- **RTO:** tempo-alvo para restaurar capacidade aprovada.
- **RPO:** perda maxima de dados aceitavel medida no tempo.

Dashboard sem timestamp, fonte ou regra de dado ausente nao mede SLO.

## SLIs canonicos

| SLI | Formula | Fonte | Dado ausente |
|---|---|---|---|
| disponibilidade de ingestao | requisicoes validas aceitas ou duplicadas com seguranca / requisicoes validas | backend + receipts | `UNKNOWN`, nunca 100% |
| latencia fonte→receipt | `receipt.serverAt - source.occurredAt`, p50/p95/p99 | evento + receipt | excluir somente com reason code; contar backlog |
| freshness do dashboard | `now - snapshot.generatedAt` | snapshot assinado | `OFFLINE/UNKNOWN`, nunca zero |
| reconciliacao | pares `idempotencyKey+contentHash` com efeito e receipt correspondentes / efeitos aceitos | Firestore + outbox | falha impeditiva |
| DLQ valida | itens validos em dead-letter / itens validos recebidos | outbox/DLQ | separar entrada invalida |
| backlog age | idade do item mais antigo por estado/severidade | fila canonica | `UNKNOWN` gera alerta |
| isolamento | tentativas cross-tenant/facility bloqueadas / tentativas de teste | logs de seguranca | ausencia de teste nao prova isolamento |
| custo IA | custo por org, tarefa, versao e caso aceito | AI run ledger | chamada sem usage/custo = `UNKNOWN` e bloqueia promocao |
| falso negativo critico | criticos omitidos / criticos adjudicados | eval congelado | N insuficiente bloqueia conclusao |

## Objetivos de homologacao sintetica

Janela inicial: sete dias consecutivos ou campanha equivalente aprovada, incluindo falhas injetadas.

| SLI | Objetivo de staging | Consequencia |
|---|---|---|
| dado clinico/identificador aceito | `0` | incidente P0, hard stop |
| efeito cross-tenant/facility | `0` | incidente P0, hard stop |
| fechamento/aprovacao automatica critica | `0` | incidente P0, hard stop |
| eventos sinteticos validos reconciliados | `100%` | nao promover enquanto houver divergencia |
| repeticao identica com segundo efeito | `0` | interromper dispatch |
| colisao idempotente silenciosa | `0` | interromper dispatch |
| fixture valida em DLQ | `0` ao fim da campanha | corrigir/justificar e repetir campanha |
| latencia fonte→receipt | p95 `<= 20 min` | investigar se exceder por duas janelas |
| freshness operacional | p95 `<= 15 min` | dashboard `STALE` acima disso |
| restore/rollback ensaiado | `100%` dos cenarios obrigatorios | gate bloqueado sem evidencia |

O valor antigo de stale de 180 segundos e incompatível com scan a cada 10 minutos e dispatch a cada 5 minutos. Ate que configuracao, trigger e objetivo sejam alinhados, o indicador de freshness e `NOT_PROVEN`.

## Proposta de objetivos para futuro piloto nao clinico

Estes valores nao entram em vigor sem aceite formal e medicao em staging.

| SLI | Objetivo proposto | Janela |
|---|---|---|
| disponibilidade de ingestao valida | `>= 99,5%` | 30 dias |
| latencia fonte→receipt | p95 `<= 15 min`; p99 `<= 30 min` | 30 dias |
| freshness do dashboard | p95 `<= 15 min` | 30 dias |
| reconciliacao de eventos e hashes | `100%` para fatos de fechamento | por ciclo |
| DLQ de entrada valida | `< 0,1%` e nenhum alto/critico aberto > 24 h | 30 dias |
| tentativas cross-tenant bloqueadas | `100%` nos testes e `0` efeito indevido | continuo |
| custo IA | dentro do budget por org/versao aprovado | diario/mensal |

Metas financeiras/clinicas e tolerancias de valores precisam de owner e regra de materialidade; “sem divergencia material” isoladamente nao e SLO.

## OLA operacional inicial

| Severidade | Acknowledge | Contencao/decisao inicial | Owner |
|---|---:|---:|---|
| P0 — dado/tenant/decisao clinica indevida | 15 min | 30 min | Incident Commander + Seguranca + Diretor Tecnico/Controlador |
| P1 — integridade, fechamento, idempotencia ou indisponibilidade critica | 30 min | 2 h | Platform/Backend + owner do dominio |
| P2 — degradacao sem perda/integridade | 4 h uteis | 1 dia util | Platform/Operacao |
| P3 — defeito menor/documental | 1 dia util | ciclo planejado | owner do componente |

OLA nao substitui prazo regulatorio, assistencial, contratual ou de recurso de glosa.

## Error budget e freeze

- Futuro SLO de 99,5% corresponde a budget maximo de 0,5% na janela, mas indisponibilidade nao e a unica dimensao.
- Qualquer P0 consome todo o budget e congela promocao, independentemente da disponibilidade agregada.
- Reconciliacao abaixo de 100% em fechamento, falso negativo critico sentinela, efeito duplicado, mistura de tenant, PII/PHI indevida ou decisao proibida tem tolerancia zero.
- Com mais de 50% do budget consumido antes de metade da janela, reduzir rollout e bloquear feature work de risco.
- Budget esgotado: congelar deploy/promocao, restaurar baseline, concluir postmortem e obter novo go/no-go.

## Canary e abort thresholds

O plano de canario registra coorte, percentual, tempo, baseline, owner e reversao. Abortar automaticamente ou por Incident Commander quando ocorrer:

- qualquer evento de tolerancia zero;
- p95 acima de 2 vezes o baseline por duas janelas consecutivas;
- erro/DLQ de entrada valida acima de 1% em qualquer janela curta ou acima do SLO aprovado;
- custo acima do hard limit por org/versao;
- drift, vies ou qualidade fora do limite predefinido;
- perda de observabilidade, versao desconhecida ou impossibilidade de rollback;
- alerta de seguranca/privacidade nao classificado dentro do OLA.

## RTO/RPO provisorios

| Componente/dado | RTO proposto futuro nao clinico | RPO proposto | Observacao |
|---|---:|---:|---|
| ingestao/backend | 4 h | 15 min | outbox preserva reenvio idempotente |
| audit trail/receipts | 4 h | 0 para evento confirmado | exige estrategia de backup/export e teste |
| planilha staging/outbox | 8 h | 15 min | nao e trilha imutavel |
| dashboard | 8 h | 24 h | nao e evidencia nem mecanismo de aprovacao |
| regras/prompts/config | 2 h | ultimo commit/versao aprovada | restaurar por artefato imutavel |

Esses objetivos permanecem `NOT_PROVEN` ate teste de restore. RTO clinico e continuidade assistencial exigem safety case separado.

## Exercicios de recuperacao

Antes de qualquer piloto:

1. pausar dispatch sem perder captura segura;
2. hard stop e remocao dos triggers pertencentes ao kernel;
3. recuperar evento aceito apos timeout sem duplicar efeito;
4. restaurar backup em ambiente isolado;
5. reconciliar outbox, integration event, entidade, audit event e receipt;
6. restaurar versao anterior de algoritmo/backend/API;
7. revogar e rotacionar chave comprometida;
8. recuperar de schema/config incorreto;
9. comprovar que producao WMGJ permaneceu inalterada;
10. registrar tempos reais, perda, divergencias e aprovacao humana.

## Evidencia SLO/DR

```text
sloReportId
environment
windowStart
windowEnd
deploymentCommit
configHash
slis
targets
observedValues
errorBudgetConsumed
incidents
excludedSamplesAndReasons
restoreExerciseId
observedRto
observedRpo
ownerDecision
approvedAt
```

Sem relatorio e sem restore ensaiado, o gate de producao permanece `BLOCKED`.
