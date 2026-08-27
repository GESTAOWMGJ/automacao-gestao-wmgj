import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {
  auditDocumentHash,
  mergeForAuditHash,
  normalizedEntityForEvent,
  producerContentHashForEvent,
  semanticHashForEvent
} from "./ingestion-integrity.js";
import {
  IngestionConflict,
  assertCompleteStoredReceipt,
  assertSameSemanticHash,
  nextAggregateVersion
} from "./mutation-contract.js";
import { validateEvent } from "./validation.js";

initializeApp();
setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: "512MiB"
});

const db = getFirestore();
const HMAC_SECRET = defineSecret("WMGJ_INGEST_HMAC_SECRET");
const ALLOWED_ORGS = defineString("WMGJ_ALLOWED_ORGS", { default: "wmgj" });
const CLOCK_SKEW_SECONDS = 300;

const ENTITY_COLLECTIONS: Record<string, string> = {
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
  governanceCase: "governanceCases",
  aiRun: "aiRuns"
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeHexEquals(expectedHex: string, receivedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function verifySignature(rawBody: Buffer, timestampHeader: string, signature: string, secret: string): boolean {
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > CLOCK_SKEW_SECONDS) return false;
  const signed = `${timestampHeader}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  return constantTimeHexEquals(expected, signature);
}

function allowedOrg(orgId: string): boolean {
  return ALLOWED_ORGS.value().split(",").map((v) => v.trim()).filter(Boolean).includes(orgId);
}

function collectionFor(entityType: string): string {
  const collection = ENTITY_COLLECTIONS[entityType];
  if (!collection) throw new Error(`ENTITY_TYPE_NOT_ALLOWED:${entityType}`);
  return collection;
}

function deterministicId(entityType: string, entityKey: string): string {
  return sha256(`${entityType}:${entityKey}`).slice(0, 48);
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]/g, " ").slice(0, 300);
}

export const ingestWmgjEvent = onRequest(
  { secrets: [HMAC_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
    const timestamp = String(req.get("x-wmgj-timestamp") || "");
    const signature = String(req.get("x-wmgj-signature") || "");
    const orgHeader = String(req.get("x-wmgj-org-id") || "");
    const idemHeader = String(req.get("x-wmgj-idempotency-key") || "");
    const secret = HMAC_SECRET.value();

    if (secret.length < 32 || !verifySignature(rawBody, timestamp, signature, secret)) {
      logger.warn("WMGJ ingest rejected", { code: "INVALID_SIGNATURE", orgHeader });
      res.status(401).json({ ok: false, code: "INVALID_SIGNATURE" });
      return;
    }

    let input: unknown;
    try {
      input = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ ok: false, code: "INVALID_JSON" });
      return;
    }

    const validation = validateEvent(input, rawBody.byteLength);
    if (!validation.ok || !validation.event) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", errors: validation.errors });
      return;
    }

    const event = validation.event;
    if (!allowedOrg(event.orgId) || event.orgId !== orgHeader || event.idempotencyKey !== idemHeader) {
      res.status(403).json({ ok: false, code: "ORG_OR_IDEMPOTENCY_MISMATCH" });
      return;
    }

    let collection: string;
    try {
      collection = collectionFor(event.entityType);
    } catch {
      res.status(400).json({ ok: false, code: "ENTITY_TYPE_NOT_ALLOWED" });
      return;
    }

    try {
      const entityId = deterministicId(event.entityType, event.entityKey);
      const idempotencyId = sha256(event.idempotencyKey);
      const payloadHash = sha256(rawBody);
      const semanticHash = semanticHashForEvent(event);
      const producerContentHash = producerContentHashForEvent(event, semanticHash);
      const orgRef = db.doc(`organizations/${event.orgId}`);
      const idemRef = orgRef.collection("integrationEvents").doc(idempotencyId);
      const entityRef = orgRef.collection(collection).doc(entityId);
      const auditRef = orgRef.collection("auditEvents").doc();
      const checkpointRef = orgRef.collection("runtimeCheckpoints").doc("ingestion");

      const result = await db.runTransaction(async (tx) => {
        const orgSnap = await tx.get(orgRef);
        const idemSnap = await tx.get(idemRef);
        const entitySnap = await tx.get(entityRef);

        if (!orgSnap.exists) throw new Error("ORGANIZATION_NOT_BOOTSTRAPPED");
        if (idemSnap.exists) {
          const previousEvent = idemSnap.data();
          assertSameSemanticHash(
            previousEvent?.semanticHash,
            semanticHash,
            previousEvent?.payloadHash,
            payloadHash
          );
          assertCompleteStoredReceipt(previousEvent ?? {});
          return {
            duplicate: true,
            entityId,
            eventId: String(previousEvent?.eventId || event.eventId),
            aggregateVersion: Number(previousEvent?.aggregateVersion || 0),
            auditEventId: String(previousEvent?.auditEventId || ""),
            contentHash: producerContentHash,
            semanticHash,
            receiptId: idempotencyId
          };
        }

        const previous = entitySnap.exists ? entitySnap.data() : null;
        const aggregateVersion = nextAggregateVersion(entitySnap.exists, previous?.version, event.expectedVersion);
        const occurredAt = Timestamp.fromDate(new Date(event.occurredAt));
        const serverTimestamp = FieldValue.serverTimestamp();
        const createdAt = entitySnap.exists
          ? previous?.createdAt ?? serverTimestamp
          : serverTimestamp;
        const normalized = normalizedEntityForEvent(
          event,
          aggregateVersion,
          idempotencyId,
          serverTimestamp,
          createdAt
        );

        const beforeHash = previous ? auditDocumentHash(previous) : null;
        const afterHash = auditDocumentHash(mergeForAuditHash(previous ?? {}, normalized));

        tx.set(entityRef, normalized, { merge: true });
        tx.create(idemRef, {
          orgId: event.orgId,
          eventId: event.eventId,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId,
          sourceSystem: event.source.system,
          sourceId: event.source.sourceId,
          metadata: event.metadata ?? {},
          payloadHash,
          semanticHash,
          producerContentHash,
          aggregateVersion,
          auditEventId: auditRef.id,
          occurredAt,
          acceptedAt: FieldValue.serverTimestamp(),
          status: "ACCEPTED"
        });
        tx.create(auditRef, {
          orgId: event.orgId,
          action: entitySnap.exists ? "ENTITY_UPDATED" : "ENTITY_CREATED",
          entityType: event.entityType,
          entityId,
          eventId: event.eventId,
          idempotencyId,
          actor: event.actor,
          source: event.source,
          metadata: event.metadata ?? {},
          beforeHash,
          afterHash,
          hashScope: "MERGED_DOCUMENT_EXCLUDING_SERVER_TIMESTAMPS_V1",
          aggregateVersion,
          occurredAt,
          serverAt: FieldValue.serverTimestamp(),
          schemaVersion: 1
        });
        tx.set(checkpointRef, {
          orgId: event.orgId,
          component: "ingestion",
          state: "HEALTHY",
          lastEventId: event.eventId,
          lastEntityType: event.entityType,
          lastAcceptedAt: FieldValue.serverTimestamp(),
          acceptedCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return {
          duplicate: false,
          entityId,
          eventId: event.eventId,
          aggregateVersion,
          auditEventId: auditRef.id,
          contentHash: producerContentHash,
          semanticHash,
          receiptId: idempotencyId
        };
      });

      res.status(result.duplicate ? 200 : 202).json({
        ok: true,
        accepted: !result.duplicate,
        duplicate: result.duplicate,
        entityId: result.entityId,
        eventId: result.eventId,
        aggregateVersion: result.aggregateVersion,
        auditEventId: result.auditEventId,
        contentHash: result.contentHash,
        semanticHash: result.semanticHash,
        receiptId: result.receiptId
      });
    } catch (error) {
      if (error instanceof IngestionConflict) {
        logger.warn("WMGJ ingest conflict", {
          eventId: event.eventId,
          entityType: event.entityType,
          code: error.code
        });
        res.status(409).json({ ok: false, code: error.code });
        return;
      }
      logger.error("WMGJ ingest failed", {
        eventId: event.eventId,
        entityType: event.entityType,
        error: publicError(error)
      });
      res.status(500).json({ ok: false, code: "INGEST_FAILED", error: publicError(error) });
    }
  }
);

export const runtimeWatchdog = onSchedule(
  { schedule: "every 15 minutes", timeZone: "America/Sao_Paulo", retryCount: 1 },
  async () => {
    const now = Timestamp.now();
    const stale = await db.collectionGroup("runtimeLocks")
      .where("state", "==", "LOCKED")
      .where("leaseUntil", "<", now)
      .limit(100)
      .get();

    if (stale.empty) return;

    const batch = db.batch();
    for (const lock of stale.docs) {
      batch.update(lock.ref, {
        state: "EXPIRED",
        expiredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    logger.warn("WMGJ watchdog expired stale locks", { count: stale.size });
  }
);

export const runtimeHealth = onRequest({ cors: false }, async (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "wmgj-firestore-ingestion",
    schemaVersion: 1,
    time: new Date().toISOString()
  });
});
