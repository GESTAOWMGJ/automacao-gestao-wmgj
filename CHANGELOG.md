# Changelog

## v1.0.1-pipeline-estavel - 2026-05-18

### Consolidado

- V3 promovida como versão oficial do pipeline WMGJ.
- Arquivo oficial: `src/01_PIPELINE_CONFIABILIDADE_WMGJ.gs`.
- Repositório oficial único: `GESTAOWMGJ/automacao-gestao-wmgj`.

### Funções oficiais

```text
diagnosticarPastaEntradaWMGJ_V3
limparTestesPipelineWMGJ_V3
criarArquivoTestePipelineWMGJ_V3
testePipelineArquivosReaisWMGJ_V3
prepararPipelineConfiavelWMGJ_V3
processarFilaWMGJ_V3
```

### Compatibilidade

As funções antigas sem `_V3` foram convertidas em wrappers para a V3, reduzindo conflito sem quebrar gatilhos já existentes no Apps Script.

### Correções

- Corrigida deduplicação falsa durante processamento.
- `PENDENTE` permanece apenas na fila.
- Memória-base recebe apenas documentos efetivamente `PROCESSADO`.
- Duplicidade validada por `ID_ORIGEM + HASH`.
- Falha individual de arquivo não derruba o lote inteiro.
- Tratamento de erro para pasta de entrada inválida ou ausente.

### Validação operacional

Teste registrado em 18/05/2026 às 09:50:

```text
Drive -> Fila -> Processamento -> Memória-base -> Log
```

Resultado:

```text
1 arquivo lido
1 arquivo enfileirado
1 arquivo processado
0 erros
0 duplicidades
```

### Revalidação operacional

Revalidação registrada em 18/05/2026 às 10:44:

```text
processarFilaWMGJ_V3
{"ok":true,"processados":1,"erros":0,"duplicados":0}

testePipelineArquivosReaisWMGJ_V3
Drive -> Fila -> Processamento -> Memória-base -> Log
lidos: 1
enfileirados: 1
duplicados no preparo: 0
processados: 1
erros: 0
duplicados no processamento: 0

processarFilaWMGJ_V3 em segunda execução
{"ok":true,"processados":0,"erros":0,"duplicados":0}
```

Conclusão: pipeline V3 confirmado como estável. A segunda execução sem itens pendentes retornou zero processamento e zero erro, comportamento esperado para fila limpa.

### Próxima fase

- Integrar Gemini/OCR em produção controlada.
- Extrair dados estruturados de PDF, imagem, XLS e DOC.
- Alimentar relatórios financeiros automáticos.
- Atualizar painel executivo e conciliação.