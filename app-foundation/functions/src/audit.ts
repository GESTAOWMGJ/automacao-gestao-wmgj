import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./firebase.js";
import { canonicalJson, sha256 } from "./crypto.js";

interface AuditEventInput {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  action: string;
  actorKind: "USER" | "SERVICE";
  actorUid: string;
  correlationId: string;
  causationId: string;
  reasonCode: string;
  beforeHash: string | null;
  afterHash: string;
}

export async function appendAuditEvent(
  transaction: Transaction,
  input: AuditEventInput,
): Promise<string> {
  const headId = `${input.aggregateType}--${input.aggregateId}`;
  const headRef = db.doc(
    `tenants/${input.tenantId}/aggregate_heads/${headId}`,
  );
  const headSnapshot = await transaction.get(headRef);
  const previous = headSnapshot.exists
    ? (headSnapshot.data() as { sequence: number; eventHash: string })
    : { sequence: 0, eventHash: "GENESIS" };

  const occurredAt = Timestamp.now();
  const sequence = previous.sequence + 1;
  const eventRef = db.collection(
    `tenants/${input.tenantId}/audit_events`,
  ).doc();
  const eventWithoutHash = {
    tenantId: input.tenantId,
    siteId: null,
    schemaVersion: 1,
    dataClass: "INTERNAL",
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    sequence,
    action: input.action,
    actorKind: input.actorKind,
    actorUid: input.actorUid,
    occurredAt: occurredAt.toDate().toISOString(),
    correlationId: input.correlationId,
    causationId: input.causationId,
    reasonCode: input.reasonCode,
    beforeHash: input.beforeHash,
    afterHash: input.afterHash,
    prevEventHash: previous.eventHash,
  };
  const eventHash = sha256(canonicalJson(eventWithoutHash));

  transaction.create(eventRef, {
    ...eventWithoutHash,
    occurredAt,
    eventHash,
  });
  transaction.set(headRef, {
    sequence,
    eventHash,
    eventId: eventRef.id,
    updatedAt: occurredAt,
  });

  return eventRef.id;
}
