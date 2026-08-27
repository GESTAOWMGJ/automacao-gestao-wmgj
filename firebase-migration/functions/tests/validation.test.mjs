import assert from "node:assert/strict";
import test from "node:test";

import { validateEvent } from "../lib/validation.js";

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "event-00000001",
    eventType: "ENTITY_UPSERT",
    orgId: "wmgj-sandbox",
    occurredAt: "2026-08-26T20:00:00.000Z",
    idempotencyKey: "idempotency-00000001",
    entityType: "governanceCase",
    entityKey: "case-00000001",
    expectedVersion: 0,
    actor: { type: "SYSTEM", id: "hkgk-apps-script", source: "HKGK_APPS_SCRIPT" },
    source: {
      system: "APPS_SCRIPT",
      sourceId: "synthetic-case-00000001",
      contentHash: "a".repeat(64)
    },
    workflowState: "CANCELLED",
    reviewState: "CHANGES_REQUESTED",
    riskLevel: "HIGH",
    sensitivity: "INTERNAL",
    record: { synthetic: true },
    ...overrides
  };
}

test("contract accepts versioned governance cases and extended states", () => {
  const value = event();
  const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
  assert.equal(result.ok, true, result.errors.join(","));
  assert.equal(result.event?.expectedVersion, 0);
});

test("contract rejects invalid expected versions", () => {
  for (const expectedVersion of [undefined, -1, 1.5, "1"]) {
    const value = event({ expectedVersion });
    const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("expectedVersion deve ser inteiro não negativo"));
  }
});

test("contract is closed at event, actor and source boundaries", () => {
  for (const value of [
    event({ unexpected: true }),
    event({ actor: { type: "SYSTEM", id: "kernel", source: "HKGK", unexpected: true } }),
    event({ source: { system: "APPS_SCRIPT", sourceId: "case-1", unexpected: true } })
  ]) {
    const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.includes("não permitido")));
  }
});

test("runtime enforces the source hash contract declared by the schema", () => {
  const value = event({
    source: { system: "APPS_SCRIPT", sourceId: "case-1", contentHash: "not-a-sha256" }
  });
  const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("source.contentHash inválido"));
});

test("record cannot shadow canonical aggregate fields", () => {
  const value = event({ record: { metadata: { forged: true }, safeValue: 1 } });
  const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("record.metadata é reservado"));
});

test("runtime rejects values it would otherwise truncate or discard", () => {
  for (const value of [
    event({ metadata: [] }),
    event({ documentType: "x".repeat(129) }),
    event({ record: { oversized: "x".repeat(50_001) } }),
    event({ record: { tooMany: Array.from({ length: 501 }, (_, index) => index) } })
  ]) {
    const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
    assert.equal(result.ok, false);
  }
});

test("occurredAt requires a complete RFC3339 timestamp", () => {
  const value = event({ occurredAt: "2026-08-26" });
  const result = validateEvent(value, Buffer.byteLength(JSON.stringify(value)));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("occurredAt não é data ISO válida"));
});
