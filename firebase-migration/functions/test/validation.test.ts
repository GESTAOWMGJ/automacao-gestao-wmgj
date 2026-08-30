import assert from "node:assert/strict";
import test from "node:test";
import { validateEvent } from "../src/validation.ts";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    eventId: "event-1",
    eventType: "ENTITY_UPSERT",
    orgId: "wmgj",
    occurredAt: "2026-08-26T18:00:00.000Z",
    sourceVersion: 1787767200000,
    idempotencyKey: "idem-1",
    entityType: "invoice",
    entityKey: "invoice:1",
    actor: { type: "SYSTEM", id: "apps-script", source: "WMGJ_APPS_SCRIPT" },
    source: { system: "SHEETS", sourceId: "sheet:tab:2" },
    workflowState: "VALIDATED",
    reviewState: "NOT_REQUIRED",
    riskLevel: "LOW",
    sensitivity: "RESTRICTED",
    competence: "2026-08",
    record: { amount: 100 },
    ...overrides
  };
}

test("evento genérico permitido é validado", () => {
  const result = validateEvent(event(), 500);
  assert.equal(result.ok, true);
  assert.equal(result.event?.entityType, "invoice");
});

test("entityType desconhecido falha antes de chegar ao Firestore", () => {
  const result = validateEvent(event({ entityType: "arbitraryCollection" }), 500);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /entityType não permitido/);
});

test("ingestão genérica bloqueia dado clínico e decisão de revisão", () => {
  for (const candidate of [
    event({ sensitivity: "CLINICAL_SENSITIVE" }),
    event({ reviewState: "APPROVED" }),
    event({ reviewState: "REJECTED" })
  ]) {
    const result = validateEvent(candidate, 500);
    assert.equal(result.ok, false);
  }
});

test("ingestão genérica bloqueia fechamento crítico", () => {
  for (const entityType of ["monthlyClosing", "reconciliation", "hospitalAccount"]) {
    const result = validateEvent(event({ entityType, workflowState: "CLOSED" }), 500);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /fechamento crítico/);
  }
  assert.equal(validateEvent(event({ entityType: "sourceDocument", workflowState: "CLOSED" }), 500).ok, true);
});

test("eventType e entityType devem formar par canônico", () => {
  assert.equal(
    validateEvent(event({ eventType: "DOCUMENT_UPSERT", entityType: "invoice" }), 500).ok,
    false
  );
  assert.equal(
    validateEvent(event({ eventType: "AI_RUN_RECORDED", entityType: "aiRun" }), 500).ok,
    true
  );
  assert.equal(
    validateEvent(event({ eventType: "ENTITY_UPSERT", entityType: "aiRun" }), 500).ok,
    false
  );
});

test("runtime exige timestamp ISO e rejeita arrays aninhados", () => {
  assert.equal(validateEvent(event({ occurredAt: "08/26/2026 18:00" }), 500).ok, false);
  assert.equal(
    validateEvent(event({ record: { unsupported: [["nested"]] } }), 500).ok,
    false
  );
});
