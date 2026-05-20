# PWA WMGJ - passo a passo de garantia

## 1. Objetivo

Criar um aplicativo web instalavel para iOS, Windows e macOS, com leitura inicial somente consulta, ligado ao status financeiro e operacional da base WMGJ.

## 2. Fundamento operacional

O PWA depende da base mestre e das rotinas de escala, produtividade, completude mensal, conciliacao financeira e notificacao. Essas rotinas sustentam o contrato financeiro do app e evitam que a tela exiba dado sem lastro.

## 3. Entregas criadas nesta fase

- Manifest instalavel.
- Service worker para cache basico.
- Tela inicial responsiva.
- Contrato de endpoint pwa_status.
- Guia de evolucao do MVP.

## 4. Criterios de aceite

- O navegador reconhece o app como instalavel.
- O service worker registra sem erro.
- A tela abre em celular e desktop.
- Sem endpoint configurado, o app mostra fallback seguro.
- Com endpoint configurado, o app consome comando pwa_status.
- Nenhuma edicao financeira e permitida nesta fase.

## 5. Sequencia operacional

1. Validar que o pipeline V3 continua estavel.
2. Publicar endpoint Apps Script com comando pwa_status.
3. Hospedar a pasta pwa em ambiente HTTPS.
4. Instalar pelo navegador no iOS, Windows e macOS.
5. Testar atualização dos KPIs.
6. Registrar evidencias no log de auditoria.

## 6. Proxima etapa tecnica

Criar no Apps Script uma funcao que responda ao comando pwa_status somando:

- receita_emitida pela aba 06_NFS_E;
- recebido pela aba 08_EXTRATOS_BRADESCO;
- em_aberto pela aba 05_FINANCEIRO_MENSAL;
- pendencias pela aba 11_PENDENCIAS_SANEAMENTO.

## 7. Regra de seguranca

O PWA nasce somente leitura. Escrita operacional fica para fase posterior com autenticacao, perfil de usuario, log antes/depois e aprovacao de fechamento.
