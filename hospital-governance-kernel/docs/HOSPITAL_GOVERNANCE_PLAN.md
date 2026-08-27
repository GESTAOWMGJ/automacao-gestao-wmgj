# Plano-base de governança hospitalar

> **Owner:** Sponsor Executivo, Diretor Técnico e Governance Control Owners
> **Status:** `CONTROLLED_DRAFT` — plano para fundação e homologação sintética; não constitui autorização clínica
> **Effective:** 2026-08-26 para desenho e testes `dry-run`
> **Review:** mensal durante fundação/piloto e trimestral após estabilização; sempre após mudança normativa ou de finalidade
> **Supersedes:** plano-base não controlado anterior deste kernel

## Objetivo final

Criar uma operação multi-hospital rastreável em que evidência, contrato, produção, faturamento, qualidade e decisão humana compartilham identificadores e estados canônicos, sem concentrar autoridade em planilhas, scripts ou modelos de IA.

## Pilares

| Pilar | Controles essenciais | Resultado esperado |
|---|---|---|
| Dados e evidência | catálogo, proprietário, classificação, versão, hash, retenção e linhagem | cada conclusão volta à fonte válida |
| Auditoria clínica | escopo, evidências, dupla revisão quando aplicável e independência | recomendação explicável sem decisão autônoma |
| Receita e contas | autorização, produção, conta, tabela, glosa, recurso e recebimento | perda evitável e divergência mensuráveis |
| Contratos e OPME | regra contratual versionada, vigência, autorização e rastreabilidade | cobrança/uso confrontados com regra vigente |
| Qualidade e risco | indicador, meta, numerador/denominador, incidente, causa e plano de ação | risco priorizado e melhoria verificável |
| Runtime e segurança | SLO, lock, retry, DLQ, segregação, IAM, incidentes e recuperação | automação observável e reversível |
| IA e algoritmos | inventário, finalidade, dados permitidos, eval, canário, custo e rollback | ganho mensurável sob supervisão humana |

## Perímetro regulatório e clínico

O plano incorpora como gates, sem substituir revisão especializada:

- [`REGULATORY_REGISTER_AND_CONTROL_MATRIX.md`](REGULATORY_REGISTER_AND_CONTROL_MATRIX.md), incluindo CFM 2.454/2026 e o status oficial/judicial por dispositivo da CFM 2.448/2025;
- [`CLINICAL_ACTIVATION_SAFETY_CASE.md`](CLINICAL_ACTIVATION_SAFETY_CASE.md), que mantém uso clínico bloqueado;
- [`DATA_PROTECTION_OPERATING_MODEL.md`](DATA_PROTECTION_OPERATING_MODEL.md), para ROPA, RIPD, agentes, minimização e incidentes;
- [`APPROVAL_RACI_AND_AUTHORITY_MATRIX.md`](APPROVAL_RACI_AND_AUTHORITY_MATRIX.md), para autoridade humana verificável.

Pré-auditoria documental, conciliação e achado administrativo não são parecer médico. Quando houver ato de auditoria médica, a decisão final pertence ao profissional habilitado dentro da regra vigente; IA não substitui auditor ou médico assistente.

## Autoridade e segregação

| Decisão | Responsável | Revisor/gate |
|---|---|---|
| pertinência clínica final | auditor médico habilitado | segunda revisão conforme risco/política |
| fechamento financeiro | responsável do ciclo de receita | gestor independente + conciliação |
| interpretação contratual relevante | responsável contratual/jurídico | aprovação conforme alçada |
| recurso de glosa definitivo | equipe autorizada | evidência e alçada registradas |
| acesso a dado sensível | proprietário do dado | privacidade/segurança e menor privilégio |
| ativação de regra, prompt ou modelo | proprietário do algoritmo | eval, segurança, negócio e canário |
| alteração de infraestrutura | plataforma | revisão técnica e plano de rollback |

IA, Apps Script, dashboard e trigger nunca aparecem como aprovadores. O solicitante não aprova a própria mudança quando houver alto risco ou decisão crítica.

A tabela acima é síntese. Quórum, papel canônico, credencial, alçada, expiração, step-up authentication e segregação são normativos na matriz RACI. `medical_auditor` é o papel canônico; alias legado não concede autoridade.

## Registro mínimo de auditoria

Cada mudança relevante deve produzir evento append-only com:

```text
eventId, orgId, facilityId, action, entityType, entityId,
actor.type, actor.id, actor.roles, occurredAt, serverAt,
correlationId, causationId, idempotencyKey,
beforeHash, afterHash, evidenceRefs,
workflowState, reviewState, decision, reasonCode,
algorithmVersion, ruleSetVersion, promptVersion, model,
approvalIds, schemaVersion
```

O evento guarda referências e hashes; documentos pesados ou conteúdo clínico bruto ficam em repositório autorizado. Correção cria novo evento, nunca reescreve o histórico.

Decisão/aprovação relevante também registra `snapshotHash`, `identityProvider`, `authenticationAssurance`, papel canônico verificado, credencial/alçada, `supersedesEventId`, commit/config da implantação e, para IA, provider, `inputHash`, `outputHash`, confiança/calibração, usage e custo. Firestore com Admin SDK não é imutabilidade por si só; retenção, proteção contra adulteração e exportação independente precisam de controle próprio.

## Fóruns e cadência

| Cadência | Fórum | Pauta objetiva |
|---|---|---|
| diária | operação | backlog, bloqueios, DLQ, falhas de integração e casos críticos |
| semanal | governança de dados/receita | qualidade da evidência, glosas, divergências e ações vencidas |
| mensal | comitê hospitalar | indicadores, riscos, contratos, qualidade, incidentes e benefício realizado |
| por versão | comitê de algoritmo | eval, mudança, custo, segurança, canário e rollback |
| trimestral | privacidade/segurança | acessos, retenção, fornecedores, incidentes e testes de recuperação |

## Indicadores mínimos

- percentual de casos com evidência completa;
- tempo por estado e backlog envelhecido;
- glosa inicial, recuperada e líquida por causa;
- diferença autorização × faturado × recebido;
- taxa de reconciliação e fechamento dentro do prazo;
- achados críticos abertos e tempo de resolução;
- alterações humanas sobre sugestões algorítmicas;
- falsos negativos críticos no conjunto avaliado;
- custo e latência por caso/versão;
- retries, dead letters, incidentes e tempo de recuperação;
- acessos indevidos ou tentativas cross-tenant bloqueadas.

Todo indicador precisa de definição, fonte, período, proprietário, meta e regra para dados ausentes. Sem isso, o dashboard exibe “indisponível”, não zero.

SLIs, objetivos provisórios, error budget, abort thresholds, RTO e RPO estão em [`SLO_ERROR_BUDGET_DR.md`](SLO_ERROR_BUDGET_DR.md). A expressão “SLO atingido” não é gate válido sem relatório assinado e janela observada.

## Matriz mínima de evidência e fechamento

`CLOSED` nunca é um gate genérico. Cada domínio precisa de pacote versionado:

| Domínio | Evidências impeditivas mínimas | Aprovação final |
|---|---|---|
| conta hospitalar | fonte, autorização, produção, itens, tabela/contrato vigentes, divergências, conciliação e pendências | ciclo de receita + alçada independente; auditor médico quando houver matéria médica |
| glosa/recurso | motivo, prazo, guia/conta, contrato/regra vigente, documentação e protocolo | equipe autorizada; `medical_auditor` quando clínico |
| OPME | autorização, indicação, compatibilidade, uso, quantidade, lote/série, fornecedor, NF, contrato/valor e rastreabilidade | auditor médico + autoridade financeira/contratual aplicável |
| contrato | documento assinado, vigência, partes, versão, regra, exceção e parecer quando necessário | contratual/jurídico + alçada de negócio |
| qualidade/incidente | definição, numerador/denominador, fonte, causa, ação, owner, prazo e verificação de eficácia | owner da qualidade + autoridade de risco |
| relatório executivo | período, versão, fontes, indicadores, reconciliação, limitações e pendências | owner do domínio + gestor independente |
| caso potencialmente clínico | safety case, evidência autorizada, profissional habilitado, direitos/registro aplicáveis e ausência de impeditivo | `medical_auditor`/Diretor Técnico conforme finalidade |

Mudança de evidência/snapshot invalida aprovação. Reabertura cria nova revisão ligada por `supersedes`; risco aceito requer autoridade, prazo, justificativa e plano, sem apagar achado.

## Evolução por estágios

| Estágio | Escopo | Gate de saída |
|---|---|---|
| 0 — Fundação | contratos, isolamento, dados sintéticos, ameaças e testes | contratos e segurança aprovados |
| 1 — Homologação | projeto separado, dry-run e reconciliação | zero escrita indevida e replay estável |
| 2 — Piloto não clínico | uma unidade/domínio, dual write e humano no circuito | dois ciclos reconciliados + SLO atingido |
| 3 — Expansão | mais unidades/domínios, RBAC e observabilidade | isolamento, suporte e recuperação comprovados |
| 4 — Governança contínua | canários, custo, qualidade e melhoria periódica | revisão recorrente sem regressão crítica |
| 5 — Avaliação clínica separada | intended use específico, dados autorizados, validação local e direitos do paciente | todos os gates do safety case + autorização institucional com prazo |

Promoção nunca é automática. Cada estágio define tenant/unidade/domínio, coorte, baseline, amostra, duração, tolerância de reconciliação, feature flag, freeze, sign-offs, hypercare e abort thresholds. Dados clínicos identificáveis não entram automaticamente no estágio seguinte; exigem gate próprio de finalidade, base legal, acesso, retenção, segurança, resposta a incidentes e responsabilidade profissional.

## Critério de sucesso

O objetivo não é automatizar o maior número de etapas. É reduzir perda, atraso, retrabalho e risco preservando evidência, responsabilidade e capacidade de interromper ou reverter o sistema.

Na situação atual, somente o Estágio 0 em ambiente sintético pode ser executado. `CLINICAL_MODE` permanece `disabled`.
