import {
  EVENT_TYPES,
  REVIEW_STATES,
  RISK_LEVELS,
  WORKFLOW_STATES,
  type ValidationResult,
  type WmgjIngestionEvent
} from "./types.js";

const ORG_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const SAFE_ENTITY = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
const ISO_COMPETENCE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_BODY_BYTES = 900_000;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const TOP_LEVEL_KEYS = [
  "schemaVersion", "eventId", "eventType", "orgId", "occurredAt", "idempotencyKey",
  "entityType", "entityKey", "expectedVersion", "actor", "source", "workflowState",
  "reviewState", "riskLevel", "sensitivity", "competence", "documentType", "record", "metadata"
];
const ACTOR_KEYS = ["type", "id", "source"];
const SOURCE_KEYS = [
  "system", "sourceId", "sourceVersion", "parentId", "fileName", "mimeType", "url",
  "contentHash", "hashMethod"
];
const RESERVED_RECORD_KEYS = [
  "orgId", "schemaVersion", "entityType", "entityKey", "version", "competence",
  "documentType", "workflowState", "reviewState", "riskLevel", "sensitivity", "source",
  "metadata", "migration", "createdAt", "updatedAt"
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, errors: string[], max = 512): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${name} ausente ou inválido`);
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > max) errors.push(`${name} excede ${max} caracteres`);
  return normalized;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  name: string,
  errors: string[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${name}.${key} não permitido`);
  }
}

function optionalString(value: unknown, name: string, errors: string[], max: number): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > max) errors.push(`${name} inválido`);
}

function validateStructuredValue(value: unknown, path: string, errors: string[], depth = 0): void {
  if (depth > 8) {
    errors.push(`${path} excede profundidade máxima`);
    return;
  }
  if (typeof value === "string") {
    if (value.length > 50_000) errors.push(`${path} excede 50000 caracteres`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) errors.push(`${path} excede 500 itens`);
    value.forEach((item, index) => validateStructuredValue(item, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      errors.push(`${path}.${key} não permitido`);
      continue;
    }
    if (key.length > 128) errors.push(`${path}.${key.slice(0, 16)}... excede 128 caracteres`);
    validateStructuredValue(child, `${path}.${key}`, errors, depth + 1);
  }
}

function cleanObject(value: unknown, depth = 0): Record<string, unknown> {
  if (!isObject(value) || depth > 8) return {};
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (key.length > 128) continue;
    if (Array.isArray(raw)) {
      output[key] = raw.slice(0, 500).map((item) =>
        isObject(item) ? cleanObject(item, depth + 1) : item
      );
    } else if (isObject(raw)) {
      output[key] = cleanObject(raw, depth + 1);
    } else if (["string", "number", "boolean"].includes(typeof raw) || raw === null) {
      output[key] = typeof raw === "string" ? raw.slice(0, 50_000) : raw;
    }
  }
  return output;
}

export function validateEvent(input: unknown, rawBytes: number): ValidationResult {
  const errors: string[] = [];
  if (rawBytes > MAX_BODY_BYTES) errors.push("payload acima do limite permitido");
  if (!isObject(input)) return { ok: false, errors: ["corpo JSON deve ser objeto"] };
  rejectUnknownKeys(input, TOP_LEVEL_KEYS, "event", errors);

  const eventId = requiredString(input.eventId, "eventId", errors, 128);
  const orgId = requiredString(input.orgId, "orgId", errors, 64);
  const occurredAt = requiredString(input.occurredAt, "occurredAt", errors, 64);
  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", errors, 512);
  const entityType = requiredString(input.entityType, "entityType", errors, 64);
  const entityKey = requiredString(input.entityKey, "entityKey", errors, 512);
  const expectedVersion = input.expectedVersion;

  if (input.schemaVersion !== 1) errors.push("schemaVersion deve ser 1");
  if (!ORG_ID.test(orgId)) errors.push("orgId fora do padrão seguro");
  if (!SAFE_ENTITY.test(entityType)) errors.push("entityType fora do padrão seguro");
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 0) {
    errors.push("expectedVersion deve ser inteiro não negativo");
  }
  if (!ISO_TIMESTAMP.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    errors.push("occurredAt não é data ISO válida");
  }
  if (!EVENT_TYPES.includes(input.eventType as never)) errors.push("eventType inválido");
  if (!WORKFLOW_STATES.includes(input.workflowState as never)) errors.push("workflowState inválido");
  if (!REVIEW_STATES.includes(input.reviewState as never)) errors.push("reviewState inválido");
  if (!RISK_LEVELS.includes(input.riskLevel as never)) errors.push("riskLevel inválido");
  if (!input.competence || input.competence === "") {
    // competência pode ser desconhecida na ingestão documental.
  } else if (typeof input.competence !== "string" || !ISO_COMPETENCE.test(input.competence)) {
    errors.push("competence deve usar YYYY-MM");
  }

  const sensitivityAllowed = ["PUBLIC", "INTERNAL", "RESTRICTED", "CLINICAL_SENSITIVE"];
  if (!sensitivityAllowed.includes(String(input.sensitivity || ""))) errors.push("sensitivity inválida");
  if (!isObject(input.actor)) errors.push("actor inválido");
  if (!isObject(input.source)) errors.push("source inválido");
  if (!isObject(input.record)) errors.push("record inválido");
  if (input.metadata !== undefined && !isObject(input.metadata)) errors.push("metadata inválido");

  const actor = isObject(input.actor) ? input.actor : {};
  const source = isObject(input.source) ? input.source : {};
  const record = isObject(input.record) ? input.record : {};
  const metadata = isObject(input.metadata) ? input.metadata : {};
  rejectUnknownKeys(actor, ACTOR_KEYS, "actor", errors);
  rejectUnknownKeys(source, SOURCE_KEYS, "source", errors);
  for (const key of Object.keys(record)) {
    if (RESERVED_RECORD_KEYS.includes(key)) errors.push(`record.${key} é reservado`);
  }
  validateStructuredValue(record, "record", errors);
  validateStructuredValue(metadata, "metadata", errors);
  const actorTypes = ["SYSTEM", "USER", "AI"];
  const sourceSystems = ["GMAIL", "DRIVE", "SHEETS", "APPS_SCRIPT", "MANUAL"];
  if (!actorTypes.includes(String(actor.type || ""))) errors.push("actor.type inválido");
  if (!sourceSystems.includes(String(source.system || ""))) errors.push("source.system inválido");
  requiredString(actor.id, "actor.id", errors, 256);
  requiredString(actor.source, "actor.source", errors, 128);
  requiredString(source.sourceId, "source.sourceId", errors, 512);
  optionalString(source.sourceVersion, "source.sourceVersion", errors, 128);
  optionalString(source.parentId, "source.parentId", errors, 512);
  optionalString(source.fileName, "source.fileName", errors, 512);
  optionalString(source.mimeType, "source.mimeType", errors, 256);
  optionalString(source.url, "source.url", errors, 2048);
  optionalString(input.documentType, "documentType", errors, 128);
  if (source.contentHash !== undefined
    && (typeof source.contentHash !== "string" || !SHA256_HEX.test(source.contentHash))) {
    errors.push("source.contentHash inválido");
  }
  const hashMethods = ["content_sha256", "metadata_sha256_fallback", "row_sha256"];
  if (source.hashMethod !== undefined && !hashMethods.includes(String(source.hashMethod))) {
    errors.push("source.hashMethod inválido");
  }

  if (errors.length > 0) return { ok: false, errors };

  const event: WmgjIngestionEvent = {
    schemaVersion: 1,
    eventId,
    eventType: input.eventType as WmgjIngestionEvent["eventType"],
    orgId,
    occurredAt,
    idempotencyKey,
    entityType,
    entityKey,
    expectedVersion: Number(expectedVersion),
    actor: {
      type: actor.type as WmgjIngestionEvent["actor"]["type"],
      id: String(actor.id),
      source: String(actor.source)
    },
    source: cleanObject(source) as unknown as WmgjIngestionEvent["source"],
    workflowState: input.workflowState as WmgjIngestionEvent["workflowState"],
    reviewState: input.reviewState as WmgjIngestionEvent["reviewState"],
    riskLevel: input.riskLevel as WmgjIngestionEvent["riskLevel"],
    sensitivity: input.sensitivity as WmgjIngestionEvent["sensitivity"],
    competence: typeof input.competence === "string" ? input.competence : undefined,
    documentType: typeof input.documentType === "string" ? input.documentType.slice(0, 128) : undefined,
    record: cleanObject(record),
    metadata: cleanObject(metadata)
  };

  return { ok: true, errors: [], event };
}
