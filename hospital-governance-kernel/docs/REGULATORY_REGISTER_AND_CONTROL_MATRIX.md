# Registro regulatorio e matriz de controles

> **Owner:** Diretor Tecnico, Encarregado de Dados e Juridico/Compliance
> **Status:** `CONTROLLED_DRAFT` — valido somente como gate documental de homologacao sintetica; nao declara conformidade nem prontidao clinica
> **Effective:** 2026-08-26 para `staging`, `DRY_RUN=true` e `CLINICAL_MODE=disabled`
> **Review:** mensal enquanto houver mudanca judicial/regulatoria relevante; trimestral apos estabilizacao; sempre antes de piloto, producao ou mudanca de finalidade
> **Supersedes:** nenhuma matriz regulatoria anterior do Hospital Governance Kernel

## Finalidade e limites

Este registro transforma referencias normativas em controles verificaveis. Ele nao substitui parecer medico, juridico, regulatorio, contabilidade, compliance ou orientacao da autoridade competente.

Nenhum item desta matriz autoriza:

- uso de dado real em homologacao;
- habilitacao de `CLINICAL_MODE`;
- auditoria medica definitiva por IA;
- negativa de cobertura, glosa definitiva, alteracao de conduta ou fechamento autonomo;
- promocao automatica de regra, prompt, modelo ou infraestrutura.

O proprietario regulatorio deve registrar, para cada revisao, `reviewId`, data, fonte oficial, versao, dispositivos aplicaveis, dispositivos suspensos ou alterados, impacto, decisao e aprovadores. Copias informais, noticias e resumos nao prevalecem sobre a fonte oficial e a avaliacao medico-juridica vigente.

## Registro de fontes oficiais

| ID | Fonte oficial | Situacao documental em 26/08/2026 | Aplicacao ao kernel | Owner de interpretacao |
|---|---|---|---|---|
| `REG-CFM-2454` | [Resolucao CFM 2.454/2026](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2026/2454_2026.pdf) | publicada em 27/02/2026; vigencia apos 180 dias, em 26/08/2026 | IA em medicina, inclusive gestao em saude e apoio administrativo capaz de influenciar resultados | Diretor Tecnico + Comissao de IA e Telemedicina + Juridico |
| `REG-CFM-2448` | [Resolucao CFM 2.448/2025](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2025/2448_2025.pdf) | publicada; diversos dispositivos estao marcados no proprio PDF como suspensos por decisao no processo `1017752-74-2026.4.01.3400`; status operacional `PENDING_MEDICAL_LEGAL_REVIEW` | perimetro, deveres, direitos e vedacoes da auditoria medica, somente apos revisao do efeito judicial atual | Diretor Tecnico + auditor medico + Juridico |
| `REG-LGPD` | [Lei 13.709/2018 compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm) | vigente; dados de saude sao dados pessoais sensiveis | todas as operacoes de tratamento, inclusive logs, integracoes e avaliacao de IA | Controlador + Operador + Encarregado |
| `REG-ANPD-RIPD` | [Orientacao oficial sobre RIPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd) | a ANPD recomenda RIPD quando o tratamento puder gerar alto risco | gate para dados sensiveis, inferencias e usos de maior impacto | Controlador + Encarregado + Seguranca |
| `REG-ANPD-AGENTES` | [Guia de agentes de tratamento e encarregado](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado) | orientacao oficial vigente | definicao contextual de controlador, operador e encarregado | Juridico/Privacidade |
| `REG-ANPD-CIS` | [Comunicacao de incidente de seguranca](https://www.gov.br/anpd/pt-br/assuntos/comunicacao-de-incidentes-de-seguranca-cis) e [regulamentacoes da ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd) | Resolucao CD/ANPD 15/2024 vigente | avaliacao, registro e comunicacao de incidente que possa gerar risco ou dano relevante | Incident Commander + Controlador + Encarregado |

## Regras para normas com disputa, suspensao ou alteracao

1. O status e verificado na fonte oficial antes de cada release e de cada decisao clinica relevante.
2. Dispositivo marcado como suspenso nao vira regra automatizada, motivo de glosa ou gate de decisao sem parecer medico-juridico atualizado.
3. A matriz registra separadamente: `vigente`, `suspenso`, `revogado`, `em transicao`, `nao aplicavel` ou `interpretacao pendente`.
4. Mudanca de status invalida o aceite anterior do rule set relacionado e exige novo replay, revisao e canario.
5. Contrato, manual de operadora, TISS/TUSS, normas ANS, SUS e regras institucionais entram em um registro por organizacao, com vigencia e fonte; nunca sao presumidos universais.

## Matriz CFM 2.454/2026

| Controle | Exigencia operacional | Evidencia minima | Gate atual |
|---|---|---|---|
| `CFM-AI-01` | avaliacao preliminar do risco do **sistema de IA**, distinta do risco de caso ou achado | classificacao baixo/medio/alto/inaceitavel, justificativa, intended use, autonomia e impacto | `BLOCKED` ate documento aprovado |
| `CFM-AI-02` | avaliacao de impacto algoritmico ao longo do ciclo de vida | AIA versionada, riscos, vieses, mitigacoes, owner e proxima revisao | `BLOCKED` para producao |
| `CFM-AI-03` | governanca institucional | Diretor Tecnico identificado; quando aplicavel, Comissao de IA e Telemedicina sob coordenacao medica e subordinada a diretoria tecnica | `BLOCKED` para ativacao clinica |
| `CFM-AI-04` | supervisao humana significativa e autonomia medica | fluxo que permita revisar, discordar, desligar e justificar; sem penalizacao por recusa fundamentada | parcial; requer teste de frontend/backend |
| `CFM-AI-05` | informacao ao paciente e respeito a recusa quando o uso for aplicavel | texto acessivel, registro da informacao/recusa e fluxo alternativo seguro | `BLOCKED` ate desenho assistencial aprovado |
| `CFM-AI-06` | registro no prontuario quando a IA apoiar decisao medica | evento de uso, finalidade, ferramenta/versao, medico responsavel e decisao final, integrado ao prontuario autorizado | `BLOCKED`; kernel nao e prontuario |
| `CFM-AI-07` | validacao cientifica, limites, riscos e vieses conhecidos | system card, estudos, conjunto de validacao, desempenho por estrato, limitacoes e indicacao regulatoria | `BLOCKED` para finalidade clinica |
| `CFM-AI-08` | auditoria especializada, monitoramento e transparencia | relatorio periodico, performance, drift, vieses, incidentes e mitigacoes, preservando sigilo | parcial em desenho; sem evidencia de producao |
| `CFM-AI-09` | seguranca, confidencialidade, integridade e necessidade | controles do modelo de protecao de dados, threat model e testes | parcial; somente sintético |
| `CFM-AI-10` | acesso legitimo a evidencias por orgaos competentes | procedimento de exportacao auditavel, autorizacao, cadeia de custodia e redacao | `BLOCKED` ate runbook e RACI aprovados |

## Matriz de auditoria medica

| Controle | Regra do kernel | Evidencia minima | Observacao regulatoria |
|---|---|---|---|
| `MED-AUD-01` | separar pre-auditoria administrativa/documental de ato medico de auditoria | classificacao de finalidade e responsavel por etapa | validar com Diretor Tecnico e Juridico |
| `MED-AUD-02` | conclusao de pertinencia medica somente por `medical_auditor` habilitado | identidade, CRM/jurisdicao, status, escopo, snapshot e assinatura da decisao | verificar regra vigente antes de ativar |
| `MED-AUD-03` | IA apenas organiza, compara, sinaliza e redige minuta | `requiresHumanReview=true`, sem comando executavel ou envio definitivo | permanente |
| `MED-AUD-04` | preservar autonomia do medico assistente e fundamentacao cientifica | evidencia clinica autorizada, norma vigente, justificativa e comunicacoes aplicaveis | revisar dispositivos ativos/suspensos da CFM 2.448/2025 |
| `MED-AUD-05` | OPME, glosa, cobertura e recurso final exigem alçada humana | pacote de evidencias, contrato vigente, autorizacao, rastreabilidade e aprovacao | nunca derivar decisao apenas de checklist/IA |
| `MED-AUD-06` | nao automatizar exigencia atualmente controvertida ou suspensa | parecer medico-juridico com data e fonte oficial | `BLOCKED` na ausencia de parecer |

## Matriz LGPD/ANPD

| Controle | Evidencia minima antes de dado real | Estado |
|---|---|---|
| `PRIV-01` | ROPA com finalidade, categorias, titulares, campos, origem, destino, acesso, compartilhamentos, retencao e descarte | ausente; bloqueia dado real |
| `PRIV-02` | controlador, operador, encarregado e subprocessadores definidos por organizacao e fluxo | ausente; bloqueia dado real |
| `PRIV-03` | base legal idonea e necessidade registradas por finalidade, sem reutilizacao silenciosa | ausente; bloqueia dado real |
| `PRIV-04` | RIPD aprovado quando aplicavel, com riscos e salvaguardas | ausente; bloqueia dado sensivel/alto risco |
| `PRIV-05` | politica de retencao, descarte, legal hold, backup e atendimento a direitos | ausente; bloqueia dado real |
| `PRIV-06` | avaliacao de fornecedor, subprocessadores, regiao e transferencia internacional | ausente; bloqueia envio externo de dado pessoal |
| `PRIV-07` | resposta a incidente, avaliacao de risco/dano, decisao do controlador e comunicacao no prazo aplicavel | desenho requerido antes de producao |
| `PRIV-08` | desidentificacao testada por allowlist e avaliacao de reidentificacao; regex isolada nao basta | ausente; FastAPI/OpenAI limitados a fixtures sinteticas |

## Evidencia de revisao obrigatoria

Antes de qualquer mudanca de ambiente ou finalidade, anexar:

```text
regulatoryReviewId
reviewedAt
officialSourceUrls
sourceDocumentHashes
applicableArticles
suspendedOrContestedArticles
interpretationSummary
impactedControls
requiredChanges
clinicalOwnerApprovalId
legalApprovalId
privacyApprovalId
nextReviewAt
```

Sem esse registro, o gate permanece `BLOCKED` e a configuracao segura continua:

```text
HKGK_ENV=staging
HKGK_ORG_ID=wmgj-sandbox
HKGK_DRY_RUN=true
HKGK_KILL_SWITCH=true
HKGK_CLINICAL_MODE=disabled
```
