# Dossiê técnico — registro de programa de computador

## AURORA NEXUS v1.0.0-RC1

**Titular pretendido:** JF NETO SERVIÇOS MÉDICOS LTDA  
**CNPJ:** confirmar antes do protocolo  
**Data de consolidação:** 18/09/2026

### Resumo

AURORA NEXUS é uma plataforma integrada para organizar, confrontar e rastrear dados, documentos, processos, evidências e indicadores em operações hospitalares e de saúde suplementar. O núcleo combina ingestão documental, validação e proveniência, confrontamento de faturamento, gestão de glosas, SLA, governança de achados, conciliação financeira, relatórios e trilha de auditoria. A arquitetura prevê integrações progressivas com Google Workspace, Apps Script/CLASP, GitHub, Firebase/Firestore e APIs, utilizando controle de acesso por organização e papel, idempotência, hashes, segregação de ambientes e validação humana obrigatória. O control plane comercial não se destina a armazenar prontuário clínico.

### Escopo próprio consolidado

- M01 Ingestão e Proveniência Documental
- M02 Contratos, Regras e Evidências
- M03 Ciclo de Receita e Conciliação
- M03.1 JFN-AUD-FAT-001 — Confrontamento de Faturamento e Rastreabilidade da Receita
- M04 Glosas, Recursos e Divergências
- M05 SLA e Workflow
- M06 Governança e Planos de Ação
- M07 Indicadores e Relatórios
- M08 Integrações e Conectores
- M09 Segurança, LGPD e Segregação
- M10 Trilha de Auditoria e Integridade

### Linguagens/tecnologias do código próprio

Python; JavaScript/Google Apps Script; TypeScript/JavaScript; JSON/JSON Schema; HTML/CSS; Firestore Security Rules; OpenAPI.

### Classificações propostas — validar no e-Software/London Marcas

Campo de aplicação: SD-01, SD-02, SD-05, AD-05.  
Tipo de programa: AP-01, AP-03, AP-04, GI-01, GI-04, GI-06, GI-07, AT-01, AT-06.

### Direitos de terceiros

Google APIs/Workspace, Firebase/Firestore SDKs, React, Next.js, FastAPI, GitHub, CLASP, Airtable, Notion e demais bibliotecas/plataformas externas são dependências, provedores ou interfaces. A documentação registral não reivindica direitos sobre esses componentes.

### Hash candidato ao depósito

Arquivo: `AURORA_NEXUS_REGISTRATION_SOURCE_v1.0.0-RC1.txt`  
Algoritmo principal: **SHA-512**  
Resumo: `cc1ff31d2985acb43b5ba94a3ff3309df8909b71c57ea2ffdd68140050720f3ec52cd01675432428aa99657c0b96cef4113361ac108130b9c553da9f461e3df4`

Controle complementar SHA-256: `c35ae4857b0b5aa86aa1bb32cb77dd85a96aeda73a680ec41eb0a3957cf2da9d`

Preservar exatamente o mesmo arquivo utilizado para gerar o hash.
