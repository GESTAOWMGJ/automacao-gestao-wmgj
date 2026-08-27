# Modelo operacional de protecao de dados

> **Owner:** Controlador e Encarregado de Dados, com Seguranca e Data Owners
> **Status:** `CONTROLLED_DRAFT` — nenhum fluxo com dado real foi aprovado por este documento
> **Effective:** 2026-08-26 para homologacao exclusivamente sintetica
> **Review:** antes de novo campo, fonte, fornecedor, finalidade, unidade ou pais/regiao; no minimo trimestralmente
> **Supersedes:** orientacoes resumidas de privacidade do kernel, sem revoga-las

## Estado seguro atual

- staging aceita somente fixtures sinteticas;
- `CLINICAL_MODE=disabled`;
- Apps Script, Properties, Cache, logs, outbox, FastAPI e OpenAI nao recebem identificador direto nem narrativa clinica real;
- `store:false` e pseudonimo sao controles complementares, nao prova de anonimidade nem base legal;
- regex de CPF/CNPJ/e-mail nao e processo suficiente de desidentificacao.

## Agentes e responsabilidade contextual

A qualificacao de agente depende da operacao concreta e nao do nome do fornecedor.

| Papel | Responsabilidade minima | Evidencia |
|---|---|---|
| controlador | define finalidade e meios essenciais, atende titulares, aprova base legal, RIPD e comunicacao de incidente | `controllerDecisionId` por fluxo |
| operador | trata somente conforme instrucao documentada do controlador | contrato/DPA e instrucoes versionadas |
| encarregado | canal com titulares/ANPD e apoio a governanca de privacidade | ato de designacao, contato e RACI |
| data owner | responde por qualidade, acesso, retencao e uso da categoria de dados | catalogo e aceite periodico |
| security owner | protege confidencialidade, integridade, disponibilidade e autenticidade | threat model, testes e incident runbook |
| subprocessador | executa parte do tratamento em cadeia | inventario, contrato, regiao, finalidade e controles |

Cada organizacao/hospital deve formalizar sua propria matriz. WMGJ, hospital, Google, Firebase, FastAPI Cloud e provedor de modelo nao recebem qualificacao fixa sem avaliar contrato e finalidade.

## ROPA — registro de operacoes de tratamento

Nenhum fluxo com dado pessoal inicia sem registro contendo:

```text
processingActivityId
organizationId
facilityId
controller
operators
subprocessors
purpose
legalBasis
dataSubjectCategories
dataCategories
sensitivity
fieldAllowlist
sourceSystems
destinations
humanRecipients
automatedProcessingDescription
decisionImpact
retentionClass
deletionMethod
backupRetention
internationalTransfer
securityControls
rightsProcedure
riskAssessmentId
ripdId
approvedAt
expiresAt
```

Finalidade nova, enriquecimento, reidratacao, uso para treinamento/eval ou compartilhamento sao novas operacoes ou mudancas materiais e exigem nova avaliacao.

## Classificacao e destino permitido

| Classe | Exemplos | Apps Script/outbox | FastAPI/OpenAI | Condicao atual |
|---|---|---|---|---|
| `PUBLIC` | material institucional publicado | metadados permitidos | somente tarefa aprovada | sintetico/publico validado |
| `INTERNAL` | runtime sem dado pessoal | allowlist | allowlist estruturada | homologacao sintetica |
| `RESTRICTED` | contrato, financeiro, fiscal, profissional | referencia/hash; conteudo minimo aprovado | proibido ate ROPA/DPA/avaliacao de transferencia | bloqueado para dado real |
| `CLINICAL_SENSITIVE` | prontuario, diagnostico, paciente, autorizacao clinica | sem conteudo bruto; apenas referencia aprovada em arquitetura futura | proibido | bloqueado |

`patientRef` e pseudonimo, nao dado anonimo. A tabela de correspondencia deve ficar separada, com owner, IAM mais restrito, chave/segredo distintos, acesso auditado e retencao propria.

## Minimizacao e desidentificacao

Ordem obrigatoria:

1. evitar coletar;
2. usar referencia controlada e hash em vez de conteudo;
3. permitir apenas campos declarados por tarefa e versao;
4. remover texto livre por padrao;
5. pseudonimizar em zona confiavel separada;
6. executar DLP/deteccao de identificadores diretos e indiretos;
7. testar reidentificacao por combinacao e casos adversariais;
8. registrar risco residual e aprovacao;
9. rejeitar explicitamente o payload, sem sanitizacao silenciosa, quando houver duvida.

Lista minima de risco: nomes, documentos, prontuario, contato, endereco, data completa, local raro, identificadores de dispositivo/conta, URL compartilhavel, narrativa clinica, combinacao de idade extrema + unidade + data e qualquer token reversivel.

O contrato de IA deve ser uma allowlist de campos por `taskType` e `schemaVersion`. `redactedInput: object` generico nao autoriza dado real.

## Finalidade, base legal e transparencia

O registro deve explicar:

- o resultado concreto pretendido;
- por que cada categoria/campo e necessario;
- a base legal idonea avaliada pelo controlador;
- se ha decisao automatizada ou influencia relevante;
- como o titular e informado;
- como exercer direitos e contestar;
- se existe recusa aplicavel e alternativa segura;
- quem recebe e por quanto tempo.

Consentimento nao deve ser presumido nem usado como resposta generica. A base legal e definida por finalidade e contexto por quem possui autoridade para isso.

## Retencao, descarte e legal hold

Antes de dado real, o Data Owner e Juridico aprovam uma tabela por categoria. O kernel nao fixa prazos legais universais.

| Classe de retencao | Inicio do prazo | Evento de descarte | Excecoes obrigatorias |
|---|---|---|---|
| evidencia primaria | conforme obrigacao assistencial, contratual, fiscal ou regulatoria aplicavel | expiracao aprovada + verificacao de vinculos | litigo, auditoria, investigacao, obrigacao legal |
| trilha de auditoria | evento/decisao | politica aprovada e preservacao de accountability | legal hold e exigencia de autoridade |
| runtime/log sanitizado | criacao | janela operacional aprovada | incidente aberto |
| fixture sintetica | criacao | fim da campanha ou versao | reproducao de teste aprovada |
| backup | criacao | expiracao/rotacao verificavel | preservacao de incidente/continuidade |

Descarte produz evento auditavel; backup expirado deve ser eliminado pelo mecanismo do provedor. Exclusao logica, anonimizacao e eliminacao fisica sao estados distintos.

## Direitos dos titulares

O procedimento deve possuir:

1. canal e autenticacao proporcional;
2. identificacao das organizacoes e sistemas envolvidos;
3. busca por referencias sem expor outros tenants;
4. validacao de retencao obrigatoria e legal hold;
5. resposta do controlador no prazo aplicavel;
6. correcao/portabilidade/eliminacao/bloqueio quando cabiveis;
7. contestacao e revisao humana de decisao automatizada aplicavel;
8. registro do pedido, decisao, evidencias e comunicacao.

## Fornecedores, modelos e transferencia

Antes de integrar fornecedor ou enviar dado pessoal, registrar:

- entidade contratante, produto e subprocessadores;
- finalidade, campos, regiao de processamento e suporte;
- transferencia internacional e salvaguardas avaliadas;
- retencao do provedor, treinamento, abuso/monitoramento e exclusao;
- controle de acesso, criptografia, chaves, logs e incidentes;
- direito de auditoria, notificacao de mudanca e termino/exportacao;
- disponibilidade, portabilidade, lock-in e plano de saida;
- model/version pinning e tratamento de mudanca unilateral.

`store:false` reduz persistencia da resposta no servico configurado, mas nao substitui esta avaliacao.

## Seguranca operacional

Controles minimos:

- IAM de menor privilegio, segregado por organizacao/unidade e recertificado;
- MFA/step-up para aprovacao, privilegio, exportacao e kill switch;
- segredo em secret manager, rotacao `current/previous`, revogacao e teste;
- TLS, criptografia em repouso e gestao de chaves proporcional ao risco;
- logs sanitizados, protecao contra adulteracao e exportacao de auditoria;
- backup, restore, RTO/RPO e teste de recuperacao;
- DLP e bloqueio de exfiltracao;
- inventario de ativos, dependencias e vulnerabilidades;
- ambientes, contas e datasets separados;
- acesso emergencial `break-glass` temporario, justificado e revisado.

## RIPD e avaliacao de risco

O controlador decide e documenta a necessidade de RIPD. Para dado de saude, larga escala, inferencia sensivel, combinacao de bases ou impacto relevante, a ausencia de avaliacao aprovada bloqueia o tratamento.

O RIPD deve descrever processos, necessidade/proporcionalidade, riscos a direitos, medidas, risco residual, responsaveis, consulta ao encarregado, versao e gatilhos de revisao.

## Incidente com dados pessoais

Fluxo minimo:

```text
DETECT -> CONTAIN -> PRESERVE -> CLASSIFY -> ASSESS RISK/HARM
-> CONTROLLER DECISION -> NOTIFY WHEN APPLICABLE -> REMEDIATE
-> VERIFY -> LESSONS LEARNED
```

- O Incident Commander coordena resposta tecnica; o controlador decide a comunicacao com apoio do encarregado e juridico.
- Incidente que possa acarretar risco ou dano relevante e tratado conforme a Resolucao CD/ANPD 15/2024; quando aplicavel, a comunicacao a ANPD e aos titulares e realizada pelo controlador em ate tres dias uteis, ressalvada regra especifica.
- Impossibilidade de comunicacao completa, complementacao, registros e preservacao seguem a norma vigente e a orientacao oficial.
- Nenhum log de incidente deve reproduzir dado clinico desnecessario.

## Gate de dados reais

Todos devem ser `PASSED`:

```text
ROPA_APPROVED
AGENTS_DEFINED
PURPOSE_AND_LEGAL_BASIS_APPROVED
FIELD_ALLOWLIST_APPROVED
RETENTION_APPROVED
RIGHTS_WORKFLOW_TESTED
VENDOR_AND_TRANSFER_REVIEWED
RIPD_DECISION_RECORDED
SECURITY_TESTS_PASSED
INCIDENT_EXERCISE_PASSED
CLINICAL_MODE_DISABLED_OR_SEPARATE_CLINICAL_AUTHORIZATION_VALID
```

Na situacao atual, o gate de dados reais permanece `BLOCKED`.
