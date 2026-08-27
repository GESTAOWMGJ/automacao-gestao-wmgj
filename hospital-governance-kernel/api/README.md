# WMGJ Governance Analysis API

Serviço interno e stateless para análise não clínica com OpenAI Responses. Não lê nem escreve Firestore, não recebe arquivos, não aceita texto livre na entrada v1 e não aprova decisões.

## Endpoints

- `GET /healthz`: processo ativo.
- `GET /readyz`: segredos e modelo configurados.
- `POST /internal/v1/governance/analyze`: HMAC, contrato estrito e métricas agregadas desidentificadas.

## Ambiente

```text
HKGK_API_MODE=dry-run
HKGK_INTERNAL_KEY_ID_CURRENT=staging-current
HKGK_INTERNAL_HMAC_CURRENT=<secret>
HKGK_INTERNAL_KEY_ID_PREVIOUS=<optional>
HKGK_INTERNAL_HMAC_PREVIOUS=<optional>
OPENAI_API_KEY=<secret>
OPENAI_MODEL=gpt-5.6
OPENAI_MODEL_ALLOWLIST=gpt-5.6
```

`dry-run` não chama a OpenAI. Em `active`, a requisição usa Responses API, `store:false` e Structured Outputs com JSON Schema estrito gerado diretamente dos modelos Pydantic. O bundle da API não depende de arquivos em `../schemas`.

`store:false` desabilita o armazenamento da resposta para recuperação posterior, mas não equivale, por si só, a Zero Data Retention. A ativação deve considerar os controles de retenção aplicáveis à organização na OpenAI.

## Contrato de entrada v1

`redactedInput` é uma allowlist fechada de métricas, flags e enums. Não há campo de texto livre. Identificadores de evidência têm somente este formato opaco:

```text
synthetic://sha256/<64 caracteres hexadecimais>
drive://sha256/<64 caracteres hexadecimais>
firestore://sha256/<64 caracteres hexadecimais>
source://sha256/<64 caracteres hexadecimais>
```

Campos aceitos em `redactedInput`:

- obrigatórios: `competence`, `variance`, `synthetic=true`;
- opcionais: `billedAmount`, `authorizedAmount`, `documentCount`, `exceptionCount`, `requiresAuthorization`, `opme`, `reconciliationState`.

O `inputHash` é SHA-256 do JSON canônico de **todo o payload**, removendo apenas o próprio `inputHash`:

```text
UTF-8(JSON(sort_keys=true, separators=(",", ":"), allow_nan=false))
```

Alterações em organização, evidências, versão de prompt, regras, schema, sensibilidade, tarefa ou métricas invalidam o hash.

O segredo HMAC selecionado precisa ter pelo menos 32 bytes. O tamanho declarado em `Content-Length` é verificado antes da leitura do corpo, e o limite é conferido novamente após a leitura. O cache de nonce é local à instância. O backend chamador precisa manter idempotência e lock distribuído por `inputHash + model`; isso evita duplicidade e custo repetido em múltiplas réplicas. O serviço não guarda estado nem recebe credencial Firebase.

A resposta upstream só é aceita com `status=completed`. Recusa, execução incompleta/falha, JSON inválido, evidência não autorizada, achado sem evidência ou risco geral inferior ao maior risco encontrado são falhas explícitas. Logs operacionais usam somente campos allowlisted e nunca incluem corpo, segredo, prompt ou saída do modelo.

## Local

```bash
uv sync --group dev
uv run pytest
uv run fastapi dev
```

As dependências de runtime são `fastapi`, `httpx` e `pydantic`. `fastapi[standard]` fica apenas no grupo de desenvolvimento/tooling.

O deploy FastAPI Cloud só deve ocorrer após autorização explícita, em aplicação de staging separada, com os segredos configurados na plataforma e depois da aprovação dos testes de bundle, contrato e upstream simulado. Esta pasta não executa deploy automaticamente.
