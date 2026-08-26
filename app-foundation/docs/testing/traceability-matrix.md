# Traceability matrix

| Requirement | Risk | Control | Test | Evidence | State |
|---|---|---|---|---|---|
| CR-001 | Accidental clinical release | Clinical routes absent; fail-closed flags | OpenAPI route allowlist | `api/tests/test_readiness.py` | CONCLUÍDO E VERIFICADO |
| PRV-002 | Real data in tests | Synthetic deterministic source marker | Response contract assertion | `GET /v1/readiness` | CONCLUÍDO E VERIFICADO |
| TEN-003 | Cross-tenant access | Explicit tenant/site scope | Negative Rules tests | `tests/firestore.rules.test.ts` | CONCLUÍDO E VERIFICADO in prior CI |
| DEP-004 | Accidental deployment | Manual dispatch; dry-run default; dual variables | Workflow static gate | `deploy-production.yml` | PREPARADO, NÃO EXECUTADO |
| VAL-005 | Technical/clinical validation confusion | Independent clinical gate | Required-approvals review | `required-approvals.md` | PENDENTE DE APROVAÇÃO |
