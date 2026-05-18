# Memória operacional — WMGJ Operação

## Estado consolidado em 18/05/2026

Este documento registra o progresso técnico validado para continuidade do projeto WMGJ Operação.

## Repositório oficial

```text
GESTAOWMGJ/automacao-gestao-wmgj
```

Todos os avanços de robô, webhook, Apps Script, Gemini, OCR, Sheets, relatórios e painel executivo devem passar primeiro por este repositório.

Repositórios antigos ficam como legado, arquivados ou não operacionais.

## Versão estável atual

```text
v1.0.1-pipeline-estavel
```

Arquivo principal:

```text
src/01_PIPELINE_CONFIABILIDADE_WMGJ.gs
```

## Pipeline validado

Fluxo operacional confirmado:

```text
Drive -> Fila -> Processamento -> Memória-base -> Log
```

Pasta de entrada validada:

```text
99_ARQUIVO_BRUTO_A_CLASSIFICAR
ID: 1Gz0GtUfvKezI8OmAH0h8fkNLlqEzfYU-
```

Abas centrais:

```text
10_LOG_AUTOMACAO
13_CONTROLE_PIPELINE
14_MEMORIA_BASE_DOCUMENTOS
15_FILA_PROCESSAMENTO
```

## Funções oficiais V3

```text
diagnosticarPastaEntradaWMGJ_V3
limparTestesPipelineWMGJ_V3
criarArquivoTestePipelineWMGJ_V3
testePipelineArquivosReaisWMGJ_V3
prepararPipelineConfiavelWMGJ_V3
processarFilaWMGJ_V3
```

As funções antigas sem `_V3` foram mantidas como wrappers para preservar compatibilidade com gatilhos antigos, mas a lógica operacional real está na V3.

## Validação operacional

### Primeira validação

Data: 18/05/2026 às 09:50

Resultado:

```text
1 arquivo lido
1 arquivo enfileirado
1 arquivo processado
0 erros
0 duplicidades
```

### Revalidação

Data: 18/05/2026 às 10:44

Resultado principal:

```text
processarFilaWMGJ_V3
{"ok":true,"processados":1,"erros":0,"duplicados":0}
```

Teste completo:

```text
testePipelineArquivosReaisWMGJ_V3
lidos: 1
enfileirados: 1
duplicados no preparo: 0
processados: 1
erros: 0
duplicados no processamento: 0
```

Segunda execução segura:

```text
processarFilaWMGJ_V3
{"ok":true,"processados":0,"erros":0,"duplicados":0}
```

Interpretação: após processar o item pendente, a segunda execução não encontrou novas pendências e não gerou erro ou duplicidade. Esse é o comportamento correto.

## Diagnóstico Gemini/OCR

Data: 18/05/2026 às 11:12

Resultado informado pelo Apps Script:

```text
Pasta de entrada: OK
99_ARQUIVO_BRUTO_A_CLASSIFICAR
ID: 1Gz0GtUfvKezI8OmAH0h8fkNLlqEzfYU-

Gemini: OK
configurado: true
modelo: gemini-1.5-flash

Extração documental: camada carregada
versao: v1.1.0-extracao-documental

Drive API avançado / OCR real: PENDENTE
driveApiAvancadoDisponivel: false
```

Conclusão: Gemini está configurado e a pasta de entrada está acessível. O gargalo atual é habilitar o serviço avançado Drive API no Apps Script e ativar Google Drive API no projeto Google Cloud vinculado.

## Gargalo resolvido

Problema anterior:

```text
Deduplicação falsa durante processamento.
```

Causa:

```text
Funções antigas no Apps Script misturavam fila operacional com memória-base, fazendo o sistema tratar arquivo PENDENTE como DUPLICADO.
```

Correção:

```text
PENDENTE fica apenas em 15_FILA_PROCESSAMENTO.
14_MEMORIA_BASE_DOCUMENTOS recebe apenas documento efetivamente PROCESSADO.
Deduplicação usa ID_ORIGEM + HASH somente contra memória processada.
```

## Status técnico atual

```text
Drive OK
Fila OK
Processamento OK
Memória-base OK
Log OK
Deduplicação OK
Reexecução segura OK
Pipeline V3 estável
Gemini configurado OK
Camada de extração documental carregada OK
OCR real pendente: Drive API avançado indisponível
```

## Próxima etapa técnica

Próximo bloco de evolução:

```text
Habilitar OCR real via Drive API avançada e testar PDF/imagem real.
```

A ordem correta é:

```text
1. Manter V3 intocada como base confiável.
2. Habilitar Drive API nos Serviços avançados do Apps Script.
3. Ativar Google Drive API no projeto Google Cloud vinculado.
4. Reexecutar diagnosticarExtracaoRealWMGJ_V1.
5. Confirmar driveApiAvancadoDisponivel: true.
6. Testar PDF/imagem na pasta 99_ARQUIVO_BRUTO_A_CLASSIFICAR.
7. Rodar executarExtracaoRealWMGJ_V1(5).
8. Validar abas 16_EXTRACOES_DOCUMENTAIS e 14_MEMORIA_BASE_DOCUMENTOS.
```

## Regra de arquitetura

Nada deve gravar diretamente na memória-base antes da validação.

Fluxo obrigatório:

```text
Arquivo bruto -> Fila -> Extração -> Classificação -> Validação JSON -> Memória-base -> Relatórios/Painel
```

## Próximos arquivos sugeridos

```text
src/06_OCR_DOCUMENTOS_WMGJ.gs
schemas/documento_extraido.schema.json
schemas/classificacao_documental.schema.json
tests/payloads/documento_texto_teste.json
tests/payloads/documento_pdf_teste.json
```

## Critério de aceite da próxima fase

A próxima fase só deve ser considerada estável quando:

```text
1 PDF processado com texto extraído
1 imagem processada com OCR ou fallback controlado
1 documento texto processado
JSON validado com categoria, competência, valor e resumo
0 falhas derrubando lote inteiro
0 duplicidades falsas
log completo em 10_LOG_AUTOMACAO
```

## Observação operacional

A V3 é a base de produção. Qualquer melhoria deve ser adicionada como camada, não como substituição improvisada. O sistema finalmente parou de acusar o próprio arquivo de duplicado; não vamos premiar esse avanço jogando código experimental dentro do motor estável.