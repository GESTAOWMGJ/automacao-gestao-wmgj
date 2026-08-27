import assert from "node:assert/strict";
import test from "node:test";

import {
  IngestionConflict,
  assertCompleteStoredReceipt,
  assertSameSemanticHash,
  nextAggregateVersion
} from "../lib/mutation-contract.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

test("same idempotency key accepts only the same semantic hash", () => {
  assert.doesNotThrow(() => assertSameSemanticHash(HASH_A, HASH_A));
  assert.doesNotThrow(() => assertSameSemanticHash(undefined, HASH_A, HASH_B, HASH_B));
  assert.throws(
    () => assertSameSemanticHash(HASH_A, HASH_B),
    error => error instanceof IngestionConflict && error.code === "IDEMPOTENCY_COLLISION"
  );
  assert.throws(
    () => assertSameSemanticHash(undefined, HASH_A, HASH_B, HASH_A),
    error => error instanceof IngestionConflict && error.code === "IDEMPOTENCY_COLLISION"
  );
});

test("legacy receipt without aggregate and audit proof is rejected explicitly", () => {
  assert.throws(
    () => assertCompleteStoredReceipt({ semanticHash: HASH_A, aggregateVersion: 0, auditEventId: "" }),
    error => error instanceof IngestionConflict && error.code === "LEGACY_RECEIPT_INCOMPLETE"
  );
  assert.doesNotThrow(() => assertCompleteStoredReceipt({
    semanticHash: HASH_A,
    aggregateVersion: 1,
    auditEventId: "audit-1"
  }));
});

test("aggregate version is compare-and-set and increments once", () => {
  assert.equal(nextAggregateVersion(false, undefined, undefined), 1);
  assert.equal(nextAggregateVersion(true, 3, 3), 4);
  assert.equal(nextAggregateVersion(true, undefined, 0), 1);
  assert.throws(
    () => nextAggregateVersion(true, undefined, undefined),
    error => error instanceof IngestionConflict && error.code === "VERSION_CONFLICT"
  );
  assert.throws(
    () => nextAggregateVersion(true, 3, 2),
    error => error instanceof IngestionConflict && error.code === "VERSION_CONFLICT"
  );
  assert.throws(
    () => nextAggregateVersion(true, "invalid", 0),
    error => error instanceof IngestionConflict && error.code === "VERSION_CONFLICT"
  );
});
