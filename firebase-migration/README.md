# WMGJ → Cloud Firestore — Kit de Migração Segura

**Data da fundação:** 26/08/2026  
**Escopo:** WMGJ Operação, gestão hospitalar replicável e auditoria runtime  
**Estado:** arquitetura e código-base preparados; **nenhuma escrita foi feita em Firestore de produção**.

## Decisão arquitetural

A planilha-mestre, o Gmail, o Drive e o Apps Script permanecem como sistema-fonte durante a transição. O Cloud Firestore entra primeiro como camada canônica paralela, com ingestão idempotente, trilha imutável, runtime auditável e isolamento por organização.

```text
Gmail / Drive / Sheets
        ↓
Apps Script atual (adaptador temporário)
        ↓ HTTPS + HMAC + idempotency key
Cloud Function v2 / API de ingestão
        ↓
Cloud Firestore
  ├─ projeções operacionais atuais
  ├─ eventos imutáveis de auditoria
  ├─ runtime / fila / watchdog
  ├─ financeiro e conciliação
  └─ módulos hospitalares replicáveis
```

## Regras inegociáveis

1. Nada fecha sem evidência.
2. Nada migra apagando ou sobrescrevendo a fonte.
3. Toda escrita possui `orgId`, `schemaVersion`, `idempotencyKey`, origem e `expectedVersion`; o backend incrementa a versão de forma transacional.
4. A mesma chave com o mesmo hash semântico é duplicata segura; hash divergente retorna `409 IDEMPOTENCY_COLLISION`.
5. IA classifica, extrai e recomenda; decisão crítica exige revisão humana.
6. Dados clínicos identificáveis não entram no primeiro backfill.
7. O modo inicial do Apps Script é `DRY_RUN=true`.
8. Deploy de código e execução operacional são pipelines separados.

## Conteúdo

- `docs/`: inventário, arquitetura, mapeamento, plano de migração, auditoria runtime, segurança e dicionário.
- `firestore/`: regras e índices.
- `functions/`: API TypeScript de ingestão assinada e watchdog.
- `apps-script/`: ponte segura e migrador incremental por checkpoint.
- `migration/`: mapa das abas e critérios de reconciliação.
- `schemas/`: contratos JSON canônicos.
- `tests/`: testes mínimos das Security Rules.
- `skills/`: habilidade operacional aprendida para continuidade.

## Implantação controlada

```bash
cd functions
npm ci
npm run build
cd ..

firebase use --add
firebase functions:secrets:set WMGJ_INGEST_HMAC_SECRET
firebase emulators:exec --only firestore,functions,auth "npm --prefix tests test"
firebase deploy --only firestore:rules,firestore:indexes,functions
```

No Apps Script, configure somente em **Script Properties**:

```text
WMGJ_FIRESTORE_INGEST_URL=https://<regiao>-<projeto>.cloudfunctions.net/ingestWmgjEvent
WMGJ_FIRESTORE_HMAC_SECRET=<segredo longo e exclusivo>
WMGJ_FIRESTORE_ORG_ID=wmgj
WMGJ_FIRESTORE_DRY_RUN=true
WMGJ_FIRESTORE_MAX_ROWS=50
```

Em homologação, configure o parâmetro da Function para aceitar apenas o tenant sintético:

```text
WMGJ_ALLOWED_ORGS=wmgj-sandbox
```

Produção usa allowlist própria e não compartilha tenant, chave HMAC ou projeto com homologação.

Depois execute:

```javascript
wmgjFirestoreDiagnostico();
wmgjFirestoreMigracaoDryRun(10);
```

A virada para `WMGJ_FIRESTORE_DRY_RUN=false` só deve ocorrer no ambiente de homologação, depois dos testes das regras, da criação da organização `wmgj` e da validação dos totais.

O bridge Drive permanece bloqueado para dual write até existir um state store durável para persistir e recarregar o `aggregateVersion` de cada `entityKey`. Sem esse controle, uma segunda versão do mesmo arquivo deve falhar com `409 VERSION_CONFLICT`; nunca se deve forçar `expectedVersion=0` para contornar o CAS.

## Critério de cutover

O Firestore só passa a ser fonte de leitura principal após dois fechamentos completos em paralelo, sem divergência material em contagens, valores, competência, vínculos de evidência, notas substituídas, conciliações e pendências críticas.
