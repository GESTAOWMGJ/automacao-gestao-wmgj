import type { WmgjIngestionEvent } from "./types.js";

export const ENTITY_COLLECTIONS: Readonly<Record<string, string>> = Object.freeze({
  sourceDocument: "sourceDocuments",
  runtimeCheckpoint: "runtimeCheckpoints",
  professional: "professionals",
  shift: "shifts",
  productivityRecord: "productivityRecords",
  contract: "contracts",
  contractRule: "contractRules",
  invoice: "invoices",
  bankTransaction: "bankTransactions",
  financialEntry: "financialEntries",
  taxObligation: "taxObligations",
  reconciliation: "reconciliations",
  monthlyClosing: "monthlyClosings",
  actionItem: "actionItems",
  hospitalAccount: "hospitalAccounts",
  authorization: "authorizations",
  billingItem: "billingItems",
  gloss: "glosses",
  appeal: "appeals",
  opmeItem: "opmeItems",
  qualityIndicator: "qualityIndicators",
  auditFinding: "auditFindings",
  aiRun: "aiRuns"
});

const CRITICAL_CLOSURE_ENTITY_TYPES = new Set([
  "monthlyClosing",
  "reconciliation",
  "hospitalAccount"
]);

export function isAllowedEntityType(entityType: string): boolean {
  return Object.hasOwn(ENTITY_COLLECTIONS, entityType);
}

export function collectionFor(entityType: string): string | undefined {
  return ENTITY_COLLECTIONS[entityType];
}

export function keyAllowsEntityType(entityTypes: readonly string[], entityType: string): boolean {
  return entityTypes.includes(entityType);
}

export function validateGenericIngestionPolicy(event: WmgjIngestionEvent): string[] {
  const errors: string[] = [];

  if (event.sensitivity === "CLINICAL_SENSITIVE") {
    errors.push("CLINICAL_SENSITIVE não é permitido na ingestão genérica");
  }
  if (event.reviewState === "APPROVED" || event.reviewState === "REJECTED") {
    errors.push("decisão de revisão exige endpoint humano dedicado");
  }
  if (event.workflowState === "CLOSED" && CRITICAL_CLOSURE_ENTITY_TYPES.has(event.entityType)) {
    errors.push("fechamento crítico exige aprovação humana dedicada");
  }

  if (event.eventType === "DOCUMENT_UPSERT" && event.entityType !== "sourceDocument") {
    errors.push("DOCUMENT_UPSERT exige entityType sourceDocument");
  }
  if (event.eventType === "RUNTIME_CHECKPOINT" && event.entityType !== "runtimeCheckpoint") {
    errors.push("RUNTIME_CHECKPOINT exige entityType runtimeCheckpoint");
  }
  if (event.eventType === "AI_RUN_RECORDED" && event.entityType !== "aiRun") {
    errors.push("AI_RUN_RECORDED exige entityType aiRun");
  }
  if (event.entityType === "aiRun" && event.eventType !== "AI_RUN_RECORDED") {
    errors.push("entityType aiRun exige eventType AI_RUN_RECORDED");
  }

  return errors;
}
