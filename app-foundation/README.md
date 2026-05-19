# WMGJ App Foundation

Fundação técnica para transformar a automação WMGJ em aplicativo com dashboard interativo.

## Objetivo

Criar uma camada de aplicação independente do Apps Script, preservando o motor atual e preparando evolução para:

- Windows;
- macOS;
- iOS futuramente;
- dashboard clicável;
- interação humana controlada;
- auditoria operacional visível.

## Stack recomendada

- React
- TypeScript
- Tauri para desktop Windows/macOS
- API intermediária futura para autenticação e integração segura
- Apps Script como motor operacional inicial

## Estrutura pretendida

```text
app-foundation/
  README.md
  architecture.md
  contracts/
    operational-status.schema.json
  ui/
    dashboard-wireframe.md
```

## Princípio

O app não deve manipular diretamente regras críticas do pipeline. Ele deve solicitar ações a uma camada controlada e exibir estado validado.

A interface humana clica. O núcleo operacional decide. Assim evitamos transformar botão bonito em máquina de quebrar planilha, uma tradição humana lamentavelmente popular.
