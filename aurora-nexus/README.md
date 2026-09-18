# AURORA NEXUS — v1.0.0-RC1

**Titular pretendido:** JF NETO SERVIÇOS MÉDICOS LTDA  
**Natureza:** software B2B de auditoria, consultoria e governança hospitalar e da saúde suplementar.  
**Data da consolidação do produto:** 18/09/2026.

AURORA NEXUS consolida o núcleo tecnológico já desenvolvido para ingestão documental, confrontamento de faturamento, gestão de glosas, SLA, governança, evidências, indicadores e rastreabilidade. A versão candidata a registro isola o domínio comercial da JF NETO e mantém dados clínicos/prontuários fora do produto.

## Princípios invariantes

1. Evidência e dado-fonte permanecem rastreáveis e versionados.
2. Ausência de informação não equivale a zero.
3. Glosa, divergência ou resposta administrativa não são encerradas sem evidência e validação humana.
4. Fechamento gerencial, conciliação bancária e liberação distributiva são estados independentes.
5. O sistema nunca autoriza pagamento automaticamente.
6. A trilha de auditoria registra ator, data/hora, fonte, entidade, hash anterior e hash atual.
7. Segregação obrigatória por organização, ambiente, papel e finalidade.
8. O control plane B2B não é prontuário eletrônico e deve rejeitar dados clínicos/pessoais desnecessários.

## Runtime relacionado verificado

Base de engenharia existente: `GESTAOWMGJ/automacao-gestao-wmgj`.

- base do PR #21: `f789dc5694d63d2311b339f3c5bf4485219d2f2c`;
- camada Next/Firebase auditada: `feat/jfn-next-firebase-20260909`, commit `7fac0be36abdbd53e741dfbc5f2ce6ed612f0ff0`;
- workflow específico **Validate JFN Next Firebase integration**: aprovado no commit acima;
- PR #21 permanece draft; esta consolidação não executa merge nem deploy.

## Pacote registral canônico

Arquivo técnico preservado: `AURORA_NEXUS_REGISTRATION_SOURCE_v1.0.0-RC1.txt`

- SHA-512: `cc1ff31d2985acb43b5ba94a3ff3309df8909b71c57ea2ffdd68140050720f3ec52cd01675432428aa99657c0b96cef4113361ac108130b9c553da9f461e3df4`
- SHA-256 complementar: `c35ae4857b0b5aa86aa1bb32cb77dd85a96aeda73a680ec41eb0a3957cf2da9d`
- tamanho: 29.405 bytes
- geração determinística: verificada por duas execuções consecutivas com bytes idênticos.

## Limites

Este release não contém credenciais, dados assistenciais, prontuários, CPF de pacientes ou payloads reais. Firebase, Google APIs, React, Next.js, FastAPI, GitHub, CLASP e demais bibliotecas/plataformas são dependências ou interfaces de terceiros; seus direitos não são reivindicados.
