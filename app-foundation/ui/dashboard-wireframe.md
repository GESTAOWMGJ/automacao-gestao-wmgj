# Wireframe do Dashboard WMGJ

## Tela inicial

```text
+--------------------------------------------------------------+
| WMGJ Operação                                                |
| Status geral: OK / ATENÇÃO / ERRO                            |
+-------------------+-------------------+----------------------+
| Pendentes         | Processados       | Erros                |
| 000               | 000               | 000                  |
+-------------------+-------------------+----------------------+
| Duplicados        | Revisão humana    | Última execução      |
| 000               | 000               | ISO_DATE             |
+--------------------------------------------------------------+
| Ações rápidas                                                |
| [Diagnosticar] [Processar fila] [Reprocessar erros]          |
| [Auditar código] [Validar status]                            |
+--------------------------------------------------------------+
| Fila de documentos                                           |
| ID | Nome | Status | Tentativas | Último erro | Ação          |
+--------------------------------------------------------------+
| Auditoria                                                    |
| ✓ Sem duplicidade global                                     |
| ✓ Deploy limitado a src/*.gs                                 |
| ✓ Fonte única de planilha                                    |
+--------------------------------------------------------------+
| Logs recentes                                                |
+--------------------------------------------------------------+
```

## Interações

### Diagnosticar

Executa diagnóstico do Apps Script e atualiza cards.

### Processar fila

Solicita processamento do próximo lote.

### Reprocessar erros

Filtra registros `ERRO_REPROCESSAR` e solicita nova tentativa.

### Auditar código

Exibe resultado da auditoria de duplicidades e limites de publicação.

### Validar status

Confirma escrita na aba `15_STATUS_AUTOMACAO`.

## Estados visuais

- OK: operação sem bloqueio.
- ATENÇÃO: há itens pendentes, revisão humana ou avisos.
- ERRO: auditoria bloqueada, credencial ausente ou falha operacional crítica.

## Regra de UX

A interface deve tornar óbvio o que é leitura, o que é ação segura e o que exige confirmação.

Botão bonito não é autorização divina para destruir dado. Infelizmente ainda precisamos escrever isso.
