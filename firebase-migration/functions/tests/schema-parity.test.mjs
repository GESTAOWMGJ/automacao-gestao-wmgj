import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  EVENT_TYPES,
  REVIEW_STATES,
  RISK_LEVELS,
  WORKFLOW_STATES
} from "../lib/types.js";

const schema = JSON.parse(fs.readFileSync(
  new URL("../../schemas/ingestion-event.schema.json", import.meta.url),
  "utf8"
));

test("published schema and runtime share required version and state enums", () => {
  assert.ok(schema.required.includes("expectedVersion"));
  assert.deepEqual(schema.properties.eventType.enum, [...EVENT_TYPES]);
  assert.deepEqual(schema.properties.workflowState.enum, [...WORKFLOW_STATES]);
  assert.deepEqual(schema.properties.reviewState.enum, [...REVIEW_STATES]);
  assert.deepEqual(schema.properties.riskLevel.enum, [...RISK_LEVELS]);
  assert.equal(schema.properties.actor.additionalProperties, false);
  assert.equal(schema.properties.source.additionalProperties, false);
});
