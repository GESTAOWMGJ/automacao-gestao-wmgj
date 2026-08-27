# Crescimento contínuo governado

> **Owner:** Algorithm Owner, com Change Authority, Clinical Safety e Internal Audit
> **Status:** `CONTROLLED_DRAFT` — crescimento apenas por mudança humana versionada; nenhuma autopromoção
> **Effective:** 2026-08-26 para replay sintético e gates de homologação
> **Review:** por versão/canário, após incidente ou mudança regulatória; mensalmente durante staging
> **Supersedes:** política não controlada anterior de crescimento do kernel

O sistema aprende por mudança versionada e evidência mensurável. Ele não reescreve a si próprio nem publica regra, prompt ou modelo automaticamente.

Risco do sistema de IA, risco do caso e severidade do achado são métricas distintas. A classificação `LOW` de um caso não reclassifica o sistema nem reduz gates regulatórios.

## Ciclo padrão

| Etapa | Entrada | Saída | Gate |
|---|---|---|---|
| Observar | métricas, falhas, revisão humana | hipótese reproduzível | fixtures sintéticas ou dados autorizados no ambiente correto; minimização comprovada |
| Registrar achado | evidência e impacto | `algorithmFinding` | proprietário e severidade |
| Propor | regra/prompt/schema candidato | artefato com hash | PR e versionamento semântico |
| Replay | conjunto dourado + casos adversariais | relatório de regressão | zero regressão crítica |
| Aprovar | relatório, riscos e rollback | decisão humana autenticada | segregação de funções |
| Canário | coorte, limite de tempo/custo e baseline registrados | comparação pareada | abort thresholds e error budget aprovados |
| Promover | canário aprovado | versão ativa | registro append-only |
| Reverter | alerta, degradação ou incidente | baseline restaurado | kill switch e evidência do incidente |

## Métricas mínimas

- precisão por regra e domínio, usando decisão humana como referência;
- taxa de falso negativo em itens críticos;
- taxa de revisão/alteração humana;
- completude de evidências;
- latência `p50/p95` e backlog por estado;
- retries, dead letters e colisões idempotentes;
- custo por caso e por versão de modelo;
- resultado por organização/unidade sem misturar tenants.

Uma versão não melhora porque produz mais achados. Ela melhora quando reduz risco ou esforço com qualidade igual ou superior, dentro de custo, latência e segurança definidos.

“Qualidade igual ou superior” deve ser definida antes do teste por métrica, margem, amostra, estrato e intervalo de confiança. Resultado sem tamanho amostral suficiente permanece `INCONCLUSIVE`.

## Política de promoção

Toda versão candidata precisa registrar:

```text
version
artifactHash
ruleSetVersion
promptVersion
schemaVersion
modelAllowlist
evalReportHash
goldenDatasetVersion
humanApprovalId
rollbackVersion
canaryWindow
canaryStatus
activatedAt
retiredAt
```

Gates impeditivos: relatório ausente, artefato sem hash, canário não aprovado, rollback ausente, mudança clínica sem revisão de segurança ou aprovação pela mesma pessoa que solicitou.

Também impedem promoção: SLO/error budget não definidos, commit/modelo mutável, fonte regulatória expirada, dado não autorizado, avaliação sem holdout, tenant misturado, diferença crítica não adjudicada ou ausência de teste de restore. Consulte [`SLO_ERROR_BUDGET_DR.md`](SLO_ERROR_BUDGET_DR.md) e a matriz RACI.

## Estratégia de avaliação

- testes determinísticos para contratos, estados, regras e HMAC;
- replay local de fixtures douradas sintéticas;
- casos adversariais de identificadores, prompt injection, replay e mistura de tenant;
- comparação pareada entre baseline e candidato;
- adjudicação humana dos desacordos de maior risco;
- conjunto de teste congelado, separado do conjunto usado para ajustar regras/prompt.

O relatório é um artefato versionado do repositório. A execução do produto não depende de uma plataforma externa de evals para decidir se uma versão pode ser promovida.

Decisão humana isolada não é automaticamente ground truth. Casos de maior risco exigem adjudicação independente, regra de desempate, conflitos registrados e medição de concordância.

## Avaliação potencialmente clínica

Fixture sintética valida contrato, estados e segurança; não valida eficácia clínica. Antes de qualquer finalidade médica, o plano de avaliação deve incluir:

- intended use, população/unidades e baseline manual;
- protocolo e análise estatística definidos antes da execução;
- dataset autorizado, representativo, versionado e separado do conjunto de ajuste;
- desempenho, falso negativo crítico, calibração e viés por estrato relevante;
- robustez a dado ausente, drift e casos fora de distribuição;
- painel qualificado e independente para adjudicação;
- limites conhecidos, instruções de uso e critérios de retirada;
- revisão científica/regulatória e todos os gates do safety case.

Não existe canário clínico enquanto `CLINICAL_MODE=disabled`.

## Mudança regulatória ou judicial

Alteração, suspensão, revogação ou nova interpretação de fonte registrada pode invalidar rule set, prompt, decisão e intended use. O owner regulatório congela a promoção, identifica versões afetadas, executa replay e obtém novo aceite. Nenhuma regra derivada de dispositivo suspenso/controvertido é ativada sem revisão médico-jurídica.

## Registro de decisão de versão

Além dos campos da política de promoção, registrar `deploymentCommit`, `configHash`, classificação do risco do sistema, AIA/RIPD aplicáveis, métricas/thresholds, resultado por tenant/estrato, error budget, incidentes, aprovadores canônicos e `supersedesVersion`.
