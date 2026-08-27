# Compatibilidade contratual com o backend Firestore do PR 13

> **Owner:** Backend Owner e Platform Owner
> **Status:** `BLOCKED_FOR_LIVE_DISPATCH` — baseline documental; compatibilidade ponta a ponta ainda deve ser comprovada em homologacao
> **Effective:** 2026-08-26 para testes locais e dry-run sintetico
> **Review:** a cada commit do backend, schema, header, enum, receipt ou configuracao de tenant
> **Supersedes:** referencias genericas ao “backend canonico do PR #13” sem versao fixada

## Baselines declarados

| Componente | Baseline | Regra |
|---|---|---|
| backend Firestore publicado | PR draft `#13`, branch `feat/firestore-migration-foundation-20260826`, head declarado `5f450e51ee3eea02b5115fb4604bcd6f02ed44d0` | reconfirmar hash remoto; ele ainda nao inclui, por si so, o candidato local abaixo |
| candidato de compatibilidade local | workspace de 2026-08-26, ainda sem commit remoto fixado | inclui estados adicionais, `governanceCase`, CAS, `semanticHash` e receipt ampliado; nao autoriza dispatch |
| kernel | commit local inicial `1ace28790aac245c49ddac6ebf71e1e675f088b0` | qualquer alteracao exige nova matriz |
| ingestao | `schemaVersion=1` | sem compatibilidade implicita com versao futura |
| ambiente | `wmgj-sandbox`, sintetico, dry-run | nenhum dado real ou tenant de producao |

Um numero de PR e mutavel e nao constitui contrato. O gate usa commit imutavel, hash dos schemas, relatorio de teste e configuracao do ambiente.

## Contrato externo aceito pelo baseline do backend

O candidato local do backend `schemaVersion=1` aceita:

```text
eventType: ENTITY_UPSERT | DOCUMENT_UPSERT | RUNTIME_CHECKPOINT | AI_RUN_RECORDED
workflowState: RECEIVED | QUEUED | CLASSIFIED | EXTRACTED | NORMALIZED |
               PENDING_EVIDENCE | PENDING_HUMAN_REVIEW | BLOCKED |
               VALIDATED | CLOSED | CANCELLED | FAILED | DEAD_LETTER
reviewState: NOT_REQUIRED | PENDING | APPROVED | REJECTED |
             CHANGES_REQUESTED | EXPIRED
riskLevel: LOW | MEDIUM | HIGH | CRITICAL
sensitivity: PUBLIC | INTERNAL | RESTRICTED | CLINICAL_SENSITIVE
source.system: GMAIL | DRIVE | SHEETS | APPS_SCRIPT | MANUAL
```

Todos os demais valores sao default-deny ate que ambos os lados sejam versionados e testados.

## Crosswalk do kernel

### Estados de documento

| Estado interno | Backend v1 | Tratamento permitido |
|---|---|---|
| `RECEIVED` a `CLOSED` e `CANCELLED` | mesmo valor quando presente na allowlist | projetar apos validacao; nunca converter `CANCELLED` em `BLOCKED` ou `CLOSED` |

### Estados de revisao

| Estado interno | Backend v1 | Tratamento permitido |
|---|---|---|
| `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`, `EXPIRED` | mesmo valor | projetar apos validacao; preservar a semantica exata |

### Tipos de evento

O adaptador atual projeta:

| Evento do kernel | Projecao atual | Limite conhecido |
|---|---|---|
| `AI_RUN_RECORDED` | `AI_RUN_RECORDED` | `entityType` precisa existir na allowlist do backend |
| qualquer outro evento do kernel | `ENTITY_UPSERT` | semantica especifica fica em `record/metadata`; requer teste por tipo |

`RUNTIME_CHECKPOINT` e `DOCUMENT_UPSERT` existem no backend, mas a projecao atual nao os seleciona especificamente. Isso nao deve ser “corrigido” apenas em documentacao: exige mudanca de codigo, versao de contrato e teste.

### Origem

| Origem interna | Projecao atual |
|---|---|
| `SYNTHETIC` | `MANUAL` |
| `API` | `APPS_SCRIPT` |
| `DRIVE`, `SHEETS`, `GMAIL`, `MANUAL` | mesmo valor |

Essa conversao perde a distincao sintetica no campo principal; `synthetic=true`, ambiente e evidencia devem continuar verificaveis em metadata/record. Nenhuma fixture pode ser confundida com fato real.

## Entity types

O candidato local do backend possui allowlist de colecoes. Entre os tipos declarados estao `sourceDocument`, `runtimeCheckpoint`, `professional`, `shift`, `productivityRecord`, `contract`, `contractRule`, `invoice`, `bankTransaction`, `financialEntry`, `taxObligation`, `reconciliation`, `monthlyClosing`, `actionItem`, `hospitalAccount`, `authorization`, `billingItem`, `gloss`, `appeal`, `opmeItem`, `qualityIndicator`, `auditFinding`, `governanceCase` e `aiRun`.

`governanceCase` e projetado para `governanceCases`. Sua presenca na allowlist e nas Security Rules nao prova autorizacao ponta a ponta: leitura/escrita por sensibilidade e papel, indices, retencao, CAS e isolamento precisam de testes no emulador. Qualquer outro aggregate type continua default-deny.

## Tenant e unidade

- o kernel usa `orgId=wmgj-sandbox` em staging;
- o backend baseline tem allowlist de organizacoes configuravel, cujo default documentado no codigo e `wmgj`;
- `wmgj-sandbox` precisa ser explicitamente permitido e bootstrapado somente no projeto de homologacao;
- uma chave HMAC deve ser escopada ao ambiente/organizacao e nunca compartilhada com producao;
- `facilityId` e projetado em metadata no baseline; isso nao comprova autorizacao por unidade.

Antes de dispatch, o backend precisa provar default-deny por organizacao e unidade, inclusive testes negativos com chave valida de outro tenant. A simples igualdade entre header e body nao substitui a autorizacao.

## HMAC, replay e rotacao

O baseline assina:

```text
HMAC-SHA256(secret, timestamp + "." + rawBody)
```

Headers enviados pelo kernel incluem timestamp, assinatura, org, idempotency key, key ID, nonce, content hash e correlation ID.

No commit de backend declarado, somente timestamp/assinatura, organizacao e idempotency key participam da verificacao principal; `keyId`, `nonce` e `content SHA-256` nao possuem validacao transacional demonstrada. Portanto:

- protecao de replay por nonce distribuido ainda e gate pendente;
- rotacao `current/previous` por `keyId` ainda e gate pendente;
- content hash do envelope nao substitui hash do corpo recebido;
- relogio, janela e revogacao devem ser testados;
- segredo de staging nunca pode ser reutilizado.

## Idempotencia e colisao

Semantica implementada no candidato local:

1. o backend calcula um `semanticHash` canonico da mutacao; `traceId`, `correlationId` e `causationId` de metadata nao alteram sua semantica;
2. mesma chave + mesmo `semanticHash` = candidata a duplicata segura, desde que o registro idempotente moderno contenha versao agregada e referencia de auditoria;
3. mesma chave + `semanticHash` diferente = `409 IDEMPOTENCY_COLLISION`, quarentena e incidente;
4. receipt legado sem `semanticHash`, versao agregada ou referencia de auditoria suficiente = `409 LEGACY_RECEIPT_INCOMPLETE`, mesmo quando o `payloadHash` legado coincide;
5. `expectedVersion` e comparado transacionalmente com a versao atual; divergencia = `409 VERSION_CONFLICT`, sem efeito parcial;
6. criacao parte da versao esperada `0` e cada mutacao aceita incrementa uma vez;
7. erro nao avanca checkpoint;
8. efeito aceito, registro idempotente, audit event e checkpoint sao gravados na mesma transacao.

O algoritmo existe em codigo e possui teste unitario local, mas a garantia operacional continua `NOT_PROVEN` ate o teste integrado comprovar concorrencia, timeout apos commit, legado e reconciliacao no Firestore Emulator.

## Receipt

O candidato local retorna para aceite novo ou duplicata moderna:

```json
{
  "ok": true,
  "accepted": true,
  "duplicate": false,
  "entityId": "...",
  "eventId": "...",
  "aggregateVersion": 1,
  "auditEventId": "...",
  "contentHash": "...",
  "semanticHash": "...",
  "receiptId": "..."
}
```

`accepted` e `duplicate` devem ser booleanos e mutuamente exclusivos. `contentHash` e o eco do hash de conteudo informado pelo produtor em `source.contentHash` — ou fallback explicitado — enquanto `semanticHash` e o hash interno da mutacao canonica. Eles nao sao intercambiaveis.

O consumidor local do kernel agora exige `ok=true`, XOR entre `accepted`/`duplicate`, hashes SHA-256 e os identificadores abaixo; não fabrica fallback nem confirma job com receipt incompleto:

```text
receiptId
eventId
contentHash
semanticHash
entityId
aggregateVersion
auditEventId
accepted XOR duplicate
```

O campo `semanticHash` é evidência técnica do backend e não substitui `contentHash`. Recibo legado incompleto nunca produz ack. A garantia ponta a ponta continua `NOT_PROVEN` até os testes consumer-driven no Emulator e a reconciliação de timeout após commit.

## Matriz minima de testes consumer-driven

| ID | Cenario | Resultado exigido |
|---|---|---|
| `CT-01` | evento sintetico valido | `202` + receipt verificavel |
| `CT-02` | repeticao identica | duplicata segura sem segundo efeito |
| `CT-03` | mesma chave, mutacao semanticamente diferente | `409 IDEMPOTENCY_COLLISION`, quarentena, nunca duplicata silenciosa |
| `CT-04` | org do header diferente do body | `403` sem escrita |
| `CT-05` | chave de outro tenant | default-deny sem escrita |
| `CT-06` | facility fora de escopo | default-deny sem escrita |
| `CT-07` | timestamp expirado/futuro | `401` sem escrita |
| `CT-08` | nonce repetido sob concorrencia/multiplas instancias | `409/401` sem segundo efeito/chamada |
| `CT-09` | key ID revogado e rotacao current/previous | comportamento conforme janela aprovada |
| `CT-10` | `CANCELLED`, `CHANGES_REQUESTED`, `EXPIRED` | round-trip sem remapeamento ou perda de semantica |
| `CT-11` | `governanceCase` valido e aggregate desconhecido | primeiro grava em `governanceCases` sob Rules aprovadas; segundo e rejeitado |
| `CT-12` | dado clinico/identificador em staging | bloqueio local e remoto, sem persistencia |
| `CT-13` | receipt sem campos obrigatorios | nao ack/ambiguous receipt |
| `CT-14` | timeout apos commit | retry resulta duplicata segura e recibo reconciliavel |
| `CT-15` | falha no meio da transacao | nenhum efeito parcial |
| `CT-16` | `expectedVersion` stale ou ausente em update | `409 VERSION_CONFLICT`, sem escrita; versao correta incrementa uma vez |
| `CT-17` | registro idempotente legado incompleto | `409 LEGACY_RECEIPT_INCOMPLETE`, sem ack nem efeito novo |

## Gate de integracao

Dispatch real em homologacao permanece bloqueado ate haver:

```text
BACKEND_COMMIT_PINNED
SCHEMAS_HASHED
SANDBOX_ORG_BOOTSTRAPPED
SANDBOX_KEY_SCOPED
ENTITY_TYPES_ALIGNED
STATE_CROSSWALK_APPROVED
NONCE_REPLAY_TESTED
KEY_ROTATION_TESTED
COLLISION_TESTED
CAS_VERSION_TESTED
LEGACY_RECEIPT_QUARANTINE_TESTED
RECEIPT_CONTRACT_TESTED
TENANT_AND_FACILITY_NEGATIVE_TESTS_PASSED
ROLLBACK_AND_RECONCILIATION_TESTED
```

Falha em qualquer item mantem `DRY_RUN=true`, `KILL_SWITCH=true` e `CLINICAL_MODE=disabled`.
