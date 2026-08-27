import { createHash } from "node:crypto";
import type { WmgjIngestionEvent } from "./types.js";

const SERVER_TIME_KEYS = new Set(["createdAt", "updatedAt", "serverAt", "importedAt"]);
const OBSERVABILITY_METADATA_KEYS = new Set(["traceId", "correlationId", "causationId"]);
const SHA256_HEX = /^[a-f0-9]{64}$/i;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const timestampLike = value as { toDate?: () => Date };
    if (typeof timestampLike.toDate === "function") return timestampLike.toDate().toISOString();
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
      if (!SERVER_TIME_KEYS.has(key)) acc[key] = stableValue(record[key]);
      return acc;
    }, {});
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function semanticHashForEvent(event: WmgjIngestionEvent): string {
  const semanticMetadata = Object.fromEntries(
    Object.entries(event.metadata ?? {}).filter(([key]) => !OBSERVABILITY_METADATA_KEYS.has(key))
  );
  return sha256(stableJson({
    schemaVersion: event.schemaVersion,
    eventType: event.eventType,
    entityType: event.entityType,
    entityKey: event.entityKey,
    expectedVersion: event.expectedVersion ?? 0,
    actor: event.actor,
    source: event.source,
    workflowState: event.workflowState,
    reviewState: event.reviewState,
    riskLevel: event.riskLevel,
    sensitivity: event.sensitivity,
    competence: event.competence ?? null,
    documentType: event.documentType ?? null,
    record: event.record,
    metadata: semanticMetadata
  }));
}

export function producerContentHashForEvent(event: WmgjIngestionEvent, semanticHash: string): string {
  return typeof event.source.contentHash === "string" && SHA256_HEX.test(event.source.contentHash)
    ? event.source.contentHash.toLowerCase()
    : semanticHash;
}

export function normalizedEntityForEvent(
  event: WmgjIngestionEvent,
  aggregateVersion: number,
  idempotencyId: string,
  serverTimestamp: unknown,
  createdAt: unknown
): Record<string, unknown> {
  return {
    ...event.record,
    orgId: event.orgId,
    schemaVersion: 1,
    entityType: event.entityType,
    entityKey: event.entityKey,
    version: aggregateVersion,
    competence: event.competence ?? null,
    documentType: event.documentType ?? null,
    workflowState: event.workflowState,
    reviewState: event.reviewState,
    riskLevel: event.riskLevel,
    sensitivity: event.sensitivity,
    source: event.source,
    metadata: event.metadata ?? {},
    migration: {
      eventId: event.eventId,
      idempotencyId,
      sourceSystem: event.source.system,
      importedAt: serverTimestamp
    },
    createdAt,
    updatedAt: serverTimestamp
  };
}

export function mergeForAuditHash(
  current: Record<string, unknown>,
  mutation: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, nextValue] of Object.entries(mutation)) {
    const currentValue = merged[key];
    merged[key] = isPlainRecord(currentValue) && isPlainRecord(nextValue)
      ? mergeForAuditHash(currentValue, nextValue)
      : nextValue;
  }
  return merged;
}

export function auditDocumentHash(document: Record<string, unknown>): string {
  return sha256(stableJson(document));
}
