# RACI, aprovacoes e matriz de autoridade

> **Owner:** Sponsor Executivo, Diretor Tecnico e Control Owner
> **Status:** `CONTROLLED_DRAFT` — define gates; nao concede papel, credencial ou autoridade clinica
> **Effective:** 2026-08-26 para homologacao sintetica e desenho de controles
> **Review:** antes de cada organizacao/unidade, mudanca de alçada ou finalidade; trimestralmente
> **Supersedes:** tabela resumida de autoridade do plano-base, preservando a regra de decisao humana

## Legenda RACI

- **R — Responsible:** executa a atividade.
- **A — Accountable:** responde pelo resultado e aceita o risco; deve haver exatamente um `A` por decisao.
- **C — Consulted:** participa antes da decisao.
- **I — Informed:** recebe o registro depois da decisao.

IA, Apps Script, dashboard, trigger, workflow e conta de servico nunca ocupam `A` ou aprovador humano.

## Papeis canonicos

| ID canonico | Papel | Limite de autoridade |
|---|---|---|
| `executive_sponsor` | Sponsor Executivo | prioridade, recursos e aceite de risco empresarial; nao substitui autoridade medica/privacidade |
| `technical_director` | Diretor Tecnico medico | governanca medica, seguranca, etica e uso institucional aplicavel de IA |
| `ai_telemedicine_commission` | Comissao de IA e Telemedicina | classificacao de risco, AIA, governanca e monitoramento quando aplicavel |
| `medical_auditor` | Auditor medico habilitado | conclusao de auditoria medica dentro de credencial, jurisdicao e escopo |
| `clinical_safety_owner` | Responsavel por seguranca clinica | safety case, hazards, validacao e vigilancia; pode ser acumulado somente se conflito for avaliado |
| `revenue_cycle_owner` | Responsavel pelo ciclo de receita | faturamento, reconciliacao e fechamento operacional/financeiro dentro da alçada |
| `contract_legal_owner` | Contratual/Juridico | interpretacao contratual e normativa; monitora alteracao/suspensao |
| `controller` | Controlador de dados | finalidade, meios essenciais, direitos, RIPD e comunicacao de incidente |
| `data_protection_officer` | Encarregado | canal e orientacao de protecao de dados; nao absorve decisao do controlador |
| `data_owner` | Proprietario do dado | qualidade, acesso, retencao e uso da categoria |
| `security_owner` | Seguranca | threat model, IAM, chaves, incidentes e aceite tecnico de risco |
| `platform_owner` | Plataforma/SRE | deploy, observabilidade, continuidade, rollback e restore |
| `backend_owner` | Backend | autorizacao, contratos, ledger de aprovacao, tenant isolation e auditoria |
| `frontend_owner` | Frontend | apresentacao de evidencia, fatores humanos, acessibilidade e ausencia de dark patterns |
| `algorithm_owner` | Proprietario do algoritmo | regras/prompts/modelos, eval, canario, custo e monitoramento |
| `internal_audit` | Auditoria independente | verifica controles e evidencias sem aprovar a propria implementacao |
| `incident_commander` | Comandante do incidente | coordena contencao, comunicacao interna, recuperacao e postmortem |

`medical_auditor` e o nome canonico. `physician_auditor` e alias legado e nao concede autoridade; deve ser rejeitado ou migrado de forma explicita no backend antes de uso real.

## RACI institucional

| Atividade/decisao | R | A | C | I |
|---|---|---|---|---|
| classificar risco do sistema de IA | `algorithm_owner`, `clinical_safety_owner` | `technical_director` | `ai_telemedicine_commission`, `security_owner`, `data_protection_officer` | `executive_sponsor`, `internal_audit` |
| aprovar intended use potencialmente clinico | `clinical_safety_owner` | `technical_director` | `medical_auditor`, `controller`, `contract_legal_owner`, backend/frontend | `executive_sponsor`, `internal_audit` |
| aprovar finalidade/base legal/RIPD | `data_protection_officer`, `data_owner` | `controller` | `contract_legal_owner`, `security_owner`, `technical_director` | `internal_audit` |
| ativar dado real nao clinico | `data_owner`, backend, plataforma | `controller` | seguranca, juridico, auditoria | sponsor |
| ativar finalidade clinica | todos os owners dos gates | `technical_director` | Comissao IA, controlador, seguranca, juridico, auditoria independente | sponsor e unidades afetadas |
| pertinencia clinica final | `medical_auditor` | `medical_auditor` designado | segundo auditor conforme risco/politica, medico assistente quando aplicavel | Diretor Tecnico |
| fechamento financeiro | `revenue_cycle_owner` | gestor com alçada independente | contabilidade, contratual, auditoria | sponsor/socios conforme governanca |
| interpretacao contratual relevante | `contract_legal_owner` | autoridade juridico-contratual designada | medico/receita/privacidade conforme impacto | solicitante e auditoria |
| recurso de glosa definitivo | equipe autorizada | autoridade por alçada | `medical_auditor`, contratual e receita | Diretor Tecnico/gestao |
| OPME final | equipe autorizada | autoridade clinico-financeira definida | `medical_auditor`, contratual, receita | Diretor Tecnico |
| promover regra/prompt/modelo | `algorithm_owner` | change authority designada | safety, backend, frontend, seguranca, negocio, auditoria | usuarios afetados |
| deploy de infraestrutura | `platform_owner` | change authority tecnica | backend, seguranca, produto | operacao/auditoria |
| ativar/desativar kill switch | `incident_commander` ou plataforma | autoridade de incidente | Diretor Tecnico quando clinico; seguranca | todos os owners afetados |
| comunicar incidente LGPD | `incident_commander`, encarregado | `controller` | juridico, seguranca, Diretor Tecnico | sponsor e areas afetadas |

O `A` nominal deve ser uma pessoa natural autenticada ou orgao colegiado com ata/decisao rastreavel; um nome de equipe isolado nao basta no registro final.

## Matriz minima de aprovacao

| Action code | Papel(is) requerido(s) | Quorum minimo | Segregacao | Expiracao maxima inicial | Evidencia impeditiva |
|---|---|---:|---|---|---|
| `CLINICAL_CONCLUSION` | `medical_auditor` | 1; 2 para `HIGH/CRITICAL` | solicitante nao aprova; revisores distintos | 24 h em alto/critico; politica local pode ser menor | prontuario/evidencia autorizada, norma vigente, snapshot |
| `FINANCIAL_CLOSURE` | `revenue_cycle_owner` + gestor independente | 2 | preparador diferente de aprovador | fim do ciclo definido | reconciliacao, documentos fiscais/bancarios, pendencias |
| `CONTRACT_DECISION` | `contract_legal_owner` + alçada de negocio | 2 quando alto impacto | autor da regra nao e unico aprovador | conforme vigencia da fonte | contrato/manual vigente e parecer quando necessario |
| `GLOSS_APPEAL_FINAL` | equipe autorizada + `medical_auditor` se houver materia medica | 1 ou 2 conforme risco/alçada | IA nunca envia | antes do prazo externo, sem excede-lo | dossie, evidencia, protocolo e revisao |
| `OPME_FINAL` | `medical_auditor` + autoridade financeira/contratual aplicavel | 2 | solicitante/fornecedor nao aprova | politica local | autorizacao, indicacao, uso, lote/serie, NF, contrato |
| `EXECUTIVE_REPORT_FINAL` | owner do dominio + gestor independente | 2 | gerador nao e unico aprovador | competencia/versao | reconciliacao e status de pendencias |
| `CLOSE_CASE` | owner do dominio | 1; 2 em alto/critico | solicitante distinto quando critico | 24 h em alto/critico | pacote de fechamento do dominio |
| `ALGORITHM_PROMOTION` | `algorithm_owner` + change authority | 2, incluindo revisor independente | autor nao aprova sozinho | janela da versao | eval, AIA quando aplicavel, canario, rollback |
| `CLINICAL_ACTIVATION` | `technical_director`, Comissao IA e `controller` | colegiado conforme ato institucional | implementador nao decide sozinho | autorizacao com prazo explicito | todos os gates do safety case |
| `PRIVILEGED_ACCESS_CHANGE` | IAM/security approver + data owner | 2 | solicitante diferente | curta e definida | ticket, menor privilegio, prazo e recertificacao |

Os prazos sao limites iniciais de seguranca, nao SLA assistencial. Politica institucional mais restritiva prevalece.

## Prova de identidade, papel e competencia

O contrato de producao exige que, antes de aceitar qualquer aprovacao, o backend verifique em fonte confiavel:

- identidade e autenticacao recente/step-up;
- organizacao e unidade;
- papel canonico ativo;
- alçada por valor, risco, dominio e finalidade;
- credencial profissional, jurisdicao e status quando aplicavel;
- delegacao formal, inicio e expiracao;
- conflito de interesse e relacao com solicitante;
- ausencia de revogacao entre abertura e decisao.

Papel enviado no payload, planilha, browser ou Apps Script nao e fonte de autoridade.

O candidato atual de ingestao do PR #13 nao demonstra esse approval ledger nem autorizacao por unidade. As validacoes locais do kernel (`BACKEND_AUTH`, `identityVerified`, ator `USER`, papel, snapshot, expiracao, quorum e segregacao) sao defesa adicional, nao prova de identidade; toda aprovacao permanece `NOT_PROVEN` ate o backend autenticado implementar e testar este contrato.

## Registro minimo de aprovacao

```text
approvalId
actionCode
organizationId
facilityId
entityType
entityId
entityVersion
snapshotHash
evidenceRefs
requesterId
requestedAt
approverId
canonicalRole
authorityPolicyVersion
credentialReference
authenticationAssurance
authenticatedAt
decision
reasonCode
reasonText
conditions
decidedAt
expiresAt
supersedesApprovalId
auditEventId
```

Mudanca de `snapshotHash`, evidencia, regra, contrato, prompt/modelo relevante, credencial ou alçada invalida a aprovacao anterior. Correcao cria novo registro e nunca reescreve a decisao.

## Frontend e revisao significativa

A tela de aprovacao deve:

- mostrar fontes, versao, hash, data/freshness e dados ausentes;
- separar fato, inferencia, suposicao e recomendacao;
- mostrar limitacoes, risco e desacordos;
- exigir motivo proprio para aprovar/rejeitar/solicitar mudanca;
- permitir abrir evidencia primaria autorizada;
- nao preselecionar aceite nem esconder alternativa humana;
- oferecer `REJECTED`, `CHANGES_REQUESTED`, `BLOCKED` e escalonamento;
- impedir submit apos expiracao ou mudanca de snapshot;
- registrar acessibilidade e teste de fatores humanos.

## Regras permanentes

1. Nada critico e aprovado pela IA.
2. Checkbox/onEdit e identidade do trigger nao provam aprovador.
3. Solicitante nao aprova a propria mudanca quando houver segregacao.
4. Quorum conta pessoas distintas, habilitadas e com papel valido.
5. Ausencia, expiracao ou ambiguidade de autoridade mantem o item pendente.
6. `NOT_REQUIRED` exige motivo e policy version; nao e default silencioso.
7. Nenhuma aprovacao clinica existe enquanto `CLINICAL_MODE=disabled`.
