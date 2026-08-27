# Segurança clínica e LGPD

> **Owner:** Diretor Técnico, Clinical Safety Owner e Controlador
> **Status:** `BLOCKED_FOR_CLINICAL_USE` — somente homologação sintética
> **Effective:** 2026-08-26 como política de bloqueio
> **Review:** antes de qualquer piloto/finalidade nova e, no mínimo, trimestralmente
> **Supersedes:** versão resumida anterior deste documento

## Padrão inicial obrigatório

```text
HKGK_CLINICAL_MODE=disabled
HKGK_DRY_RUN=true
HKGK_KILL_SWITCH=true
HKGK_ENV=staging
HKGK_ORG_ID=wmgj-sandbox
DATA=synthetic_only
```

Nenhuma parte do código, teste, dashboard ou documento constitui autorização clínica. A ativação depende do [`CLINICAL_ACTIVATION_SAFETY_CASE.md`](CLINICAL_ACTIVATION_SAFETY_CASE.md), da matriz regulatória e de aprovação institucional verificável.

## Perímetro regulatório

- A [Resolução CFM 2.454/2026](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2026/2454_2026.pdf) vigora desde 26/08/2026 e abrange sistemas de IA em medicina, inclusive gestão em saúde e apoio administrativo capaz de influenciar processos ou resultados.
- A [Resolução CFM 2.448/2025](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2025/2448_2025.pdf) regulamenta auditoria médica; o PDF oficial assinala dispositivos suspensos judicialmente. Aplicação concreta exige revisão médico-jurídica atualizada, sem transformar dispositivo suspenso/controvertido em regra automática.
- A classificação de risco do **sistema de IA** é independente do risco de caso/conta e da severidade de achado.
- Pré-auditoria documental/administrativa não pode ser apresentada como parecer ou auditoria médica definitiva.

O registro de fontes, status e controles está em [`REGULATORY_REGISTER_AND_CONTROL_MATRIX.md`](REGULATORY_REGISTER_AND_CONTROL_MATRIX.md).

## Dados e pseudonimização

- `patientRef` é pseudônimo, não dado anônimo.
- Nome, CPF, prontuário, contato, endereço, datas raras, narrativa clínica e combinações reidentificadoras não entram em Properties, Cache, log, outbox, FastAPI ou OpenAI.
- Conteúdo sensível permanece na fonte autorizada. Reidratação futura somente no backend autorizado, com finalidade, base legal, papel, unidade e ROPA válidos.
- Regex de identificador direto não prova desidentificação. Dado real exige allowlist estruturada, DLP, avaliação de reidentificação e controles do [`DATA_PROTECTION_OPERATING_MODEL.md`](DATA_PROTECTION_OPERATING_MODEL.md).
- `store:false` não substitui minimização, contrato/DPA, avaliação de fornecedor, transferência, retenção ou RIPD.

## Decisões bloqueadas para IA

- diagnóstico, prognóstico, prescrição, alta, transferência ou tratamento;
- comunicação autônoma de diagnóstico, prognóstico ou decisão terapêutica;
- negativa de cobertura, caracterização de fraude ou pertinência clínica definitiva;
- fechamento de conta/competência;
- pagamento, distribuição ou reconhecimento contábil;
- envio definitivo de recurso de glosa;
- conclusão final de OPME, contrato relevante ou relatório executivo;
- exclusão/substituição de evidência ou alteração de prontuário;
- alteração de papéis, permissões ou alçadas;
- promoção autônoma de regra, prompt, modelo, schema ou deploy.

Essas proibições alcançam IA generativa, regras determinísticas, Apps Script, dashboard, trigger e qualquer automação.

## Aprovação e supervisão significativa

Casos clínicos, financeiros, contratuais, OPME, glosa final e relatório executivo exigem aprovação humana autenticada conforme [`APPROVAL_RACI_AND_AUTHORITY_MATRIX.md`](APPROVAL_RACI_AND_AUTHORITY_MATRIX.md).

- `medical_auditor` é o papel médico canônico; `physician_auditor` é alias legado sem autoridade.
- Alto/Crítico exige segregação e, para conclusão clínica, dois revisores qualificados distintos, salvo política institucional formal mais restritiva.
- Antes de qualquer ativação, o backend **deve** verificar identidade, credencial, jurisdição, papel, `facility` scope, alçada, conflito, snapshot e expiração. O candidato atual ainda não demonstra autorização por unidade e, por isso, este gate está `BLOCKED`.
- Apps Script apenas solicita/consulta aprovação. Trigger instalável, `onEdit`, checkbox ou papel vindo do cliente não comprovam identidade.
- O profissional deve poder discordar, bloquear, desligar, justificar e usar alternativa segura sem dark pattern ou penalização indevida.

## Direitos do paciente e registro assistencial

Quando aplicável ao intended use aprovado:

- informar de forma clara e acessível o uso de IA;
- respeitar e registrar recusa informada e oferecer alternativa segura;
- preservar contestação, revisão humana e segunda opinião;
- registrar o uso relevante de IA no prontuário autorizado quando apoiar decisão médica;
- manter mediação humana em comunicação clínica.

Firestore, dashboard e audit event não substituem prontuário.

## Incidente clínico

Falso negativo crítico, uso fora do escopo, decisão automática proibida, profissional sem credencial, viés material, dado clínico indevido, mistura de tenant ou impossibilidade de rollback geram hard stop, preservação de evidência, avaliação dos casos expostos e acionamento do Diretor Técnico/Incident Commander.

O retorno exige nova validação e autorização; corrigir código ou prompt isoladamente não encerra o incidente.
