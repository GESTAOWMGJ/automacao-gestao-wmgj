export type ConflictCode =
  | "IDEMPOTENCY_COLLISION"
  | "VERSION_CONFLICT"
  | "LEGACY_RECEIPT_INCOMPLETE";

export class IngestionConflict extends Error {
  constructor(readonly code: ConflictCode) {
    super(code);
    this.name = "IngestionConflict";
  }
}

export function assertSameSemanticHash(
  existingSemanticHash: unknown,
  incomingSemanticHash: string,
  existingPayloadHash?: unknown,
  incomingPayloadHash?: string
): void {
  const semanticMatches = typeof existingSemanticHash === "string"
    && existingSemanticHash.toLowerCase() === incomingSemanticHash.toLowerCase();
  const legacyPayloadMatches = typeof existingSemanticHash !== "string"
    && typeof existingPayloadHash === "string"
    && typeof incomingPayloadHash === "string"
    && existingPayloadHash.toLowerCase() === incomingPayloadHash.toLowerCase();
  if (!semanticMatches && !legacyPayloadMatches) {
    throw new IngestionConflict("IDEMPOTENCY_COLLISION");
  }
}

export function assertCompleteStoredReceipt(stored: Record<string, unknown>): void {
  if (typeof stored.semanticHash !== "string"
    || !Number.isInteger(stored.aggregateVersion)
    || Number(stored.aggregateVersion) < 1
    || typeof stored.auditEventId !== "string"
    || !stored.auditEventId) {
    throw new IngestionConflict("LEGACY_RECEIPT_INCOMPLETE");
  }
}

export function nextAggregateVersion(
  entityExists: boolean,
  currentVersionValue: unknown,
  expectedVersionValue: number | undefined
): number {
  const currentVersion = entityExists ? Number(currentVersionValue ?? 0) : 0;
  if (entityExists && expectedVersionValue === undefined) {
    throw new IngestionConflict("VERSION_CONFLICT");
  }
  const expectedVersion = expectedVersionValue ?? 0;
  if (!Number.isInteger(currentVersion) || currentVersion < 0 || expectedVersion !== currentVersion) {
    throw new IngestionConflict("VERSION_CONFLICT");
  }
  return currentVersion + 1;
}
