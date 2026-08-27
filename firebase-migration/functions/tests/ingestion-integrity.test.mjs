import assert from "node:assert/strict";
import test from "node:test";

import {
  auditDocumentHash,
  mergeForAuditHash,
  normalizedEntityForEvent,
  producerContentHashForEvent,
  semanticHashForEvent
} from "../lib/ingestion-integrity.js";

const PRODUCER_HASH = "c".repeat(64);

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "evt-1",
    eventType: "ENTITY_UPSERT",
    orgId: "wmgj-sandbox",
    occurredAt: "2026-08-26T00:00:00.000Z",
    idempotencyKey: "idem-1",
    entityType: "governanceCase",
    entityKey: "case-1",
    expectedVersion: 0,
    actor: { type: "SYSTEM", id: "kernel", source: "HKGK_APPS_SCRIPT" },
    source: { system: "APPS_SCRIPT", sourceId: "case-1", contentHash: PRODUCER_HASH },
    workflowState: "PENDING_HUMAN_REVIEW",
    reviewState: "PENDING",
    riskLevel: "HIGH",
    sensitivity: "RESTRICTED",
    record: { amount: 10, nested: { retained: true } },
    metadata: {
      facilityId: "facility-1",
      traceId: "trace-1",
      correlationId: "correlation-1",
      causationId: "causation-1"
    },
    ...overrides
  };
}

test("producer hash is echoed separately from the internal semantic hash", () => {
  const input = event();
  const semanticHash = semanticHashForEvent(input);
  assert.notEqual(semanticHash, PRODUCER_HASH);
  assert.equal(producerContentHashForEvent(input, semanticHash), PRODUCER_HASH);
});

test("observability IDs do not change semantic identity, but mutation fields do", () => {
  const original = event();
  const rediscovered = event({
    metadata: {
      ...original.metadata,
      traceId: "trace-2",
      correlationId: "correlation-2",
      causationId: "causation-2"
    }
  });
  assert.equal(semanticHashForEvent(original), semanticHashForEvent(rediscovered));
  assert.notEqual(
    semanticHashForEvent(original),
    semanticHashForEvent(event({ workflowState: "BLOCKED" }))
  );
  assert.notEqual(
    semanticHashForEvent(original),
    semanticHashForEvent(event({ record: { amount: 11, nested: { retained: true } } }))
  );
  assert.notEqual(
    semanticHashForEvent(original),
    semanticHashForEvent(event({ metadata: { ...original.metadata, facilityId: "facility-2" } }))
  );
});

test("normalized aggregate persists facility, evidence and algorithm lineage", () => {
  const input = event({
    metadata: {
      facilityId: "facility-1",
      evidenceRefs: ["evidence-synthetic-1"],
      algorithm: { ruleSetVersion: "rules-v1" },
      traceId: "trace-1"
    }
  });
  const normalized = normalizedEntityForEvent(input, 1, "idem-hash", "SERVER_TIME", "SERVER_TIME");
  assert.deepEqual(normalized.metadata, input.metadata);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.migration.idempotencyId, "idem-hash");
});

test("nested merge preserves omitted fields and produces the expected audit hash", () => {
  const current = { nested: { keep: true, replace: 1 }, top: "keep" };
  const mutation = { nested: { replace: 2 }, added: "yes" };
  const merged = mergeForAuditHash(current, mutation);
  assert.deepEqual(merged, {
    nested: { keep: true, replace: 2 },
    top: "keep",
    added: "yes"
  });
  assert.equal(auditDocumentHash(merged), auditDocumentHash({
    added: "yes",
    nested: { replace: 2, keep: true },
    top: "keep",
    updatedAt: "ignored"
  }));
});
