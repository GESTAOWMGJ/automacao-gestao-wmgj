# Safety case para ativacao clinica

> **Owner:** Diretor Tecnico e Comissao de IA e Telemedicina
> **Status:** `BLOCKED` — template de evidencia; o Hospital Governance Kernel nao esta pronto nem autorizado para uso clinico
> **Effective:** 2026-08-26 como bloqueio obrigatorio; somente homologacao sintetica
> **Review:** antes de qualquer piloto ou mudanca de finalidade e, se algum dia aprovado, a cada versao relevante e no minimo trimestralmente
> **Supersedes:** nenhuma autorizacao clinica anterior; nao existe autorizacao clinica valida para este kernel

## Decisao atual

```text
CLINICAL_MODE=disabled
DRY_RUN=true
KILL_SWITCH=true
DATA=synthetic_only
CLINICAL_ACTIVATION=BLOCKED
```

Este documento define as evidencias que seriam necessarias para avaliar uma futura ativacao. Preencher o template nao concede autorizacao. A ativacao exige decisao humana autenticada, segregada, documentada e reversivel no backend e na governanca institucional.

## Escopo e linguagem de risco

Tres dimensoes nunca devem ser confundidas:

| Dimensao | Exemplo | Owner |
|---|---|---|
| risco do sistema de IA | baixo, medio, alto ou inaceitavel conforme avaliacao institucional | Diretor Tecnico + Comissao de IA |
| risco do caso/conta | impacto potencial de um caso individual | owner assistencial/receita |
| severidade do achado | prioridade de uma inconsistencia detectada | auditor responsavel |

A classificacao de um caso como `LOW` nao reduz automaticamente o risco regulatorio do sistema e nunca autoriza fechamento pela IA.

## Intended use obrigatorio

O safety case deve especificar, sem termos genericos:

- organizacao, unidade e populacao abrangidas;
- usuario previsto e qualificacao necessaria;
- tarefa exata, entrada permitida, saida e decisao afetada;
- beneficio esperado e baseline manual;
- nivel de autonomia e pontos de intervencao humana;
- ambiente, integracoes e dependencias;
- usos proibidos, limitacoes conhecidas e situacoes fora de distribuicao;
- efeito da indisponibilidade, erro, atraso, viés ou dado ausente;
- alternativa segura quando o usuario ou paciente recusar o uso aplicavel.

`Auditoria hospitalar`, `apoio clinico` ou `gestao em saude` isoladamente nao sao intended use suficiente.

## Usos permanentemente proibidos para IA

- diagnosticar, prescrever, definir prognostico, alta, transferencia ou tratamento;
- comunicar autonomamente diagnostico, prognostico ou decisao terapeutica;
- negar cobertura, caracterizar fraude ou emitir parecer clinico definitivo;
- glosar, enviar recurso definitivo ou modificar conta em producao;
- fechar competencia, reconhecer valor, aprovar pagamento ou distribuicao;
- aprovar OPME, pertinencia medica, contrato relevante ou relatorio executivo final;
- alterar papel, permissao, evidencia, prontuario ou fonte primaria;
- substituir o medico auditor, o medico assistente ou o Diretor Tecnico;
- promover a si propria, regra, prompt, modelo ou schema.

## Gates impeditivos

Todos os gates precisam estar `PASSED` para a finalidade e versao exatas. `PARTIAL`, `NOT_TESTED`, `EXPIRED` ou evidencia sem hash equivalem a `BLOCKED`.

| Gate | Owner responsavel | Evidencia minima | Criterio de passagem |
|---|---|---|---|
| `G0_SCOPE` | Product owner + Diretor Tecnico | intended use, prohibited use, unidade/populacao, fluxo e baseline | escopo inequivoco e sem autoridade automatica |
| `G1_REGULATORY` | Juridico/Compliance + Diretor Tecnico | matriz regulatoria revisada, inclusive status judicial da CFM 2.448/2025 | parecer medico-juridico datado e sem pendencia impeditiva |
| `G2_AI_RISK` | Comissao de IA | avaliacao preliminar de risco do sistema e AIA | classificacao aprovada e mitigacoes financiadas/atribuidas |
| `G3_CLINICAL_GOVERNANCE` | Diretor Tecnico | Comissao de IA e Telemedicina quando aplicavel, RACI, credenciais e alçadas | responsabilidades pessoais e institucionais aceitas |
| `G4_PRIVACY` | Controlador + Encarregado | ROPA, base legal/finalidade, RIPD quando aplicavel, retencao, fornecedores e direitos | privacidade aprovada para cada fluxo/campo/destino |
| `G5_SECURITY` | Seguranca | threat model, testes negativos, IAM, chaves, logs, backup e incident response | nenhuma falha critica aberta e residual formalmente aceito |
| `G6_BACKEND` | Backend owner | autenticacao, autorizacao, tenant/facility isolation, approval ledger, idempotencia e auditabilidade | testes contratuais/seguranca verdes e rollback ensaiado |
| `G7_FRONTEND` | Frontend owner + Clinical safety | evidencia, versao, limitacoes, conflitos e fontes visiveis; sem dark pattern | teste de fatores humanos demonstra revisao significativa |
| `G8_CLINICAL_VALIDATION` | Clinical safety + auditoria independente | protocolo, amostra, holdout, estratos, baseline, falsos negativos e adjudicacao | thresholds predefinidos atingidos sem regressao critica |
| `G9_OPERATIONS` | Platform/SRE | SLO, error budget, RTO/RPO, observabilidade, suporte, treinamento e runbooks | simulacoes e restore/rollback comprovados |
| `G10_PATIENT_RIGHTS` | Diretor Tecnico + Encarregado | informacao acessivel, registro, recusa, alternativa, contestacao e segunda opiniao aplicaveis | fluxo aprovado e testado ponta a ponta |
| `G11_CANARY` | Change authority | coorte, janela, baseline, abort thresholds e hypercare | canario aprovado sem evento sentinela |
| `G12_FINAL_AUTHORIZATION` | Diretor Tecnico + Comissao IA + Controlador | pacote completo com hashes e aprovacoes segregadas | autorizacao explicita de finalidade, versao, unidade e prazo |

## Supervisao humana significativa

A interface e o backend devem comprovar que o revisor:

1. foi autenticado com identidade forte e papel vigente;
2. possui habilitacao e jurisdicao requeridas;
3. visualizou evidencia primaria, versao, data, limitacoes e conflitos;
4. pode discordar, solicitar mudanca, bloquear ou desligar a IA sem penalizacao;
5. registra decisao propria, fundamento, fontes e grau de certeza;
6. nao aprova sua propria solicitacao quando houver segregacao;
7. nao recebe sugestao da IA como opcao preselecionada irreversivel;
8. tem tempo e condicoes para revisao real, sem automacao por fadiga.

`onEdit`, checkbox, identidade do criador do trigger, clique simples ou papel informado pelo cliente nao comprovam revisao significativa.

## Qualificacao e credenciais

Para conclusao clinica, o papel canonico e `medical_auditor`. O alias `physician_auditor` deve ser tratado como legado e nao concede autoridade.

O backend deve verificar no instante da decisao:

```text
userId
identityProvider
authenticationTime
authenticationAssurance
canonicalRole
organizationId
facilityScope
professionalRegistration
jurisdiction
credentialStatus
credentialCheckedAt
conflictOfInterest
delegationId
```

## Validacao clinica e algoritmica

Fixtures sinteticas validam contrato e seguranca; nao demonstram eficacia clinica.

Uma avaliacao potencialmente clinica deve possuir:

- protocolo previamente aprovado;
- dados autorizados, representativos e separados do conjunto de ajuste;
- baseline manual e comparacao pareada;
- amostra e margem definidas antes do teste;
- desempenho e erros estratificados por unidade e grupos relevantes;
- taxa de falso negativo para itens criticos;
- calibracao, robustez, drift e dados ausentes;
- analise dos desacordos por painel qualificado e independente;
- limites de generalizacao e condicoes de retirada;
- model/prompt/rule/schema fixados e reproduziveis.

Qualquer falso negativo critico sentinela, mistura de tenant, dado clinico indevido, decisao automatica proibida ou impossibilidade de reproduzir a versao aborta o canario.

## Direitos, comunicacao e prontuario

Quando a utilizacao se enquadrar na Resolucao CFM 2.454/2026, o desenho aprovado deve prever:

- informacao clara e acessivel ao paciente sobre o uso aplicavel;
- registro da informacao e da recusa quando pertinente;
- alternativa segura e nao discriminatoria;
- contestacao, revisao humana e segunda opiniao;
- registro no prontuario autorizado quando a IA apoiar decisao medica;
- mediacao humana para comunicacao clinica;
- identificacao da ferramenta/versao e do medico responsavel.

O kernel nao e prontuario. Um evento no Firestore nao substitui o registro assistencial exigivel no sistema autorizado.

## Incidente de seguranca do paciente

Eventos sentinela incluem:

- dano ou quase dano associado a sugestao algoritimica;
- falso negativo critico;
- recomendacao fora do intended use;
- automacao de ato proibido;
- uso sem informacao/recusa aplicavel;
- profissional sem credencial ou conflito de interesse;
- versao desconhecida, drift material ou vies discriminatorio;
- indisponibilidade sem fallback seguro;
- vazamento, reidentificacao ou acesso cross-tenant.

Resposta minima: interromper a finalidade afetada, preservar evidencias, acionar o medico responsavel e Incident Commander, avaliar pacientes/casos expostos, comunicar instancias competentes conforme regra vigente, corrigir, validar e obter nova autorizacao antes de retomar.

## Registro de autorizacao final

```text
clinicalAuthorizationId
intendedUseId
organizationId
facilityIds
systemRiskClass
algorithmVersion
modelVersion
promptVersion
ruleSetVersion
schemaVersion
deploymentCommit
gateEvidenceHashes
approvedByTechnicalDirector
approvedByAiCommission
approvedByController
approvedBySecurity
approvedByPrivacy
independentAuditId
authorizedAt
expiresAt
rollbackVersion
```

Na ausencia desse registro completo e verificavel, `CLINICAL_MODE` permanece `disabled`.
