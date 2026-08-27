# Modelo de ameaças

> **Owner:** Security Owner, com Data Protection, Backend e Clinical Safety Owners
> **Status:** `CONTROLLED_DRAFT` — suficiente apenas para threat review de staging sintético; risco clínico e produção bloqueados
> **Effective:** 2026-08-26 para homologação e testes adversariais
> **Review:** por release, mudança de fornecedor/integração/escopo e trimestralmente; imediatamente após incidente
> **Supersedes:** modelo resumido anterior deste kernel

## Ativos protegidos

- evidências e referências documentais;
- identidade, função e decisão do aprovador;
- trilha de auditoria e hashes de versão;
- chaves HMAC, credenciais OpenAI e configuração de deploy;
- isolamento de organização/unidade;
- orçamento e limites de chamadas externas.
- segurança do paciente, autonomia médica e direito de contestação;
- classificação de risco, intended use, AIA/RIPD e evidências regulatórias;
- backups, artefatos de deploy, conjuntos de avaliação e cadeia de suprimentos.

## Limites de confiança

| Origem | Tratamento obrigatório |
|---|---|
| Planilha/Drive | entrada não confiável; schema, tamanho, estado e identificadores são validados |
| Apps Script | produtor limitado; nunca recebe Admin SDK nem autoridade de aprovação |
| Backend canônico | único limite transacional para idempotência, autorização e auditoria |
| FastAPI | serviço interno stateless; aceita apenas payload desidentificado e assinado |
| OpenAI | processador externo sem autoridade decisória; saída sempre revalidada |
| Dashboard | projeção de leitura; não é evidência nem mecanismo de aprovação |

Planilha, Apps Script, browser, modelo e payload não são fontes de identidade, papel, alçada, base legal ou verdade clínica. O backend deve verificar essas dimensões em fontes autorizadas.

## Ameaças e controles

| Ameaça | Controle | Falha segura |
|---|---|---|
| Evento repetido | chave idempotente + hash de conteúdo | duplicata segura ou quarentena por colisão |
| Replay de requisição | alvo: timestamp, nonce distribuído e HMAC; candidato atual valida somente timestamp/HMAC na ingestão | dispatch bloqueado até `401/409` comprovado sem segundo efeito |
| Alteração do payload | SHA-256 canônico e comparação constante | assinatura inválida |
| Vazamento de identificador | contrato default-deny por chave/valor e staging sintético | rejeição explícita; sem sanitização silenciosa |
| Exposição de segredo | Script Properties/secret store, redaction e auditoria de literais | serviço não fica ready |
| Aprovação indevida | identidade autenticada no backend e segregação de funções | caso permanece pendente |
| Regra/algoritmo defeituoso | replay dourado, canário, aprovação e rollback obrigatório | versão anterior permanece ativa |
| Loop de custo | retry limitado, 4xx em DLQ, lock de custo no backend | interrupção e alerta |
| Prompt injection | sem ferramentas, input delimitado, schema estrito e referências allowlisted | saída rejeitada/revisão humana |
| Falha parcial | outbox, lease, checkpoint e dead-letter | cursor não avança sem persistência |
| Confusão de tenant | `orgId` validado e autorização no backend/Rules | negação default-deny |
| Confusão de unidade | alvo: `facilityId` validado contra escopo do membro/chave; candidato atual trata-o apenas como metadata | dispatch bloqueado; não aceitar apenas porque o tenant coincide |
| Conta Google/criador de trigger comprometido | MFA, conta institucional, inventário/owner de triggers, sessão e revogação | hard stop e rotação; trigger não aprova |
| Insider/elevação de privilégio | step-up, dupla aprovação, least privilege, recertificação e audit log externo | negar e preservar tentativa |
| Supply chain/CI/clasp comprometidos | dependências fixadas, provenance, secrets isolados, revisão e ambiente protegido | não publicar/deploy; revogar credenciais |
| Fórmula/CSV injection | tratar célula como dado, escape de prefixos executáveis e export seguro | rejeitar/quarentenar campo |
| XSS/output injection | renderização por texto, sanitização e CSP; saída do modelo não vira HTML/comando | rejeitar saída/projeção |
| SSRF/URL maliciosa | schemes/hosts allowlisted, nunca buscar `evidenceRef` arbitrária | negar referência sem fetch |
| Evidência substituída/TOCTOU | versão, content hash e freshness; revalidar no fechamento | invalidar aprovação/snapshot |
| Reidentificação | allowlist, sem texto livre, DLP, teste de combinação e mapping separado | rejeitar envio externo |
| Data/golden-set poisoning | origem, hash, segregação treino/teste e revisão independente | retirar dataset/versão e repetir eval |
| Vies/drift/model change | system card, versão fixada, métricas estratificadas e monitoramento | limitar finalidade, rollback ou descontinuar |
| Provider retention/transfer | DPA, subprocessadores, região, finalidade e `store:false` complementar | não enviar dado pessoal |
| DoS/quota/cost exhaustion | quota por org/versão, circuit breaker, budget e backpressure | degradar sem perder evidência |
| Clock skew/key compromise | janela atual de 300 s; alvo exige tempo confiável, `keyId`, rotação/revogação e exercício | serviço não ready enquanto `keyId` não for validado |
| Audit log tampering | append-only lógico + acesso privilegiado restrito + export/retention independente | bloquear fechamento e investigar |
| Backup corrompido/ransomware | cópia isolada, integridade e restore periódico | manter indisponível até restore validado |
| Automação/fadiga de aprovação | UI sem default de aceite, tempo de revisão, amostragem e métricas de override | exigir revisão/segundo aprovador |
| Uso fora do intended use | scope/version no pedido e gate de finalidade | rejeitar e abrir incidente clínico |

## Riscos residuais aceitos em homologação

- O cache de nonce do FastAPI é local à instância; ele é complementar, não distribuído.
- A planilha não é log imutável; recibos canônicos pertencem ao backend/Firestore.
- `drive.file` limita o Drive aos arquivos criados ou selecionados pelo app, mas o projeto ainda exige revisão periódica de escopos.
- A primeira versão exclui conteúdo `CLINICAL_SENSITIVE`; habilitação exige decisão documentada sobre RIPD, RIPD aprovado quando aplicável, matriz de acesso, retenção e resposta a incidentes.
- O detector atual de identificadores diretos não demonstra anonimização e não cobre adequadamente texto livre/quase-identificadores; somente fixtures sintéticas são aceitas.
- O candidato local implementa `semanticHash`, colisão idempotente e CAS, mas ainda exige comprovação integrada. Nonce distribuído, rotação por `keyId` e autorização por `facility` permanecem ausentes/não provados.
- Firestore com Admin SDK não é WORM; imutabilidade forte e export de auditoria ainda precisam de desenho/teste.

## Gates antes de produção

1. Threat modeling revisado por segurança e encarregado de dados.
2. Teste de isolamento entre organizações e autorização negativa.
3. Rotação de chaves `current/previous` comprovada.
4. Lock distribuído e orçamento de IA comprovados sob concorrência.
5. Backup, recuperação, dead-letter e rollback ensaiados.
6. Dados clínicos permanecem bloqueados até aprovação formal específica.
7. Supply chain, OAuth/trigger owner, formula injection, XSS, SSRF e reidentificação testados.
8. ROPA/RIPD/fornecedores/transferência e resposta ANPD aprovados quando aplicáveis.
9. SLO, error budget, RTO/RPO e restore/rollback comprovados.
10. Safety case, classificação do risco do sistema, AIA e direitos do paciente aprovados antes de finalidade médica.

Os gates detalhados estão em [`DATA_PROTECTION_OPERATING_MODEL.md`](DATA_PROTECTION_OPERATING_MODEL.md), [`PR13_CONTRACT_COMPATIBILITY.md`](PR13_CONTRACT_COMPATIBILITY.md), [`SLO_ERROR_BUDGET_DR.md`](SLO_ERROR_BUDGET_DR.md) e [`CLINICAL_ACTIVATION_SAFETY_CASE.md`](CLINICAL_ACTIVATION_SAFETY_CASE.md).
