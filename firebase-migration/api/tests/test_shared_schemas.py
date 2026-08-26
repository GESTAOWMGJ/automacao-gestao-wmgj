import json
from pathlib import Path

from jsonschema import Draft202012Validator


SCHEMAS = Path(__file__).parents[2] / "schemas"


def reviewed_ai_run() -> dict:
    return {
        "schemaVersion": 1,
        "runId": "run-1",
        "orgId": "wmgj",
        "provider": "openai",
        "status": "COMPLETED_PENDING_REVIEW",
        "reviewState": "APPROVED",
        "model": "gpt-5.6",
        "promptVersion": "prompt-v1",
        "rulesetVersion": "rules-v1",
        "sensitivity": "RESTRICTED",
        "evidenceRefs": ["doc:1"],
        "inputHash": "a" * 64,
        "outputHash": "b" * 64,
        "result": {
            "executiveSummary": "Rascunho revisado.",
            "abstained": False,
            "findings": [],
            "missingEvidence": [],
            "recommendedActions": [],
            "limitations": ["Decisão humana registrada separadamente."],
            "needsHumanReview": True,
        },
        "createdAt": "2026-08-26T10:00:00Z",
        "reviewedAt": "2026-08-26T11:00:00Z",
        "reviewerUid": "auditor-1",
        "revision": 3,
    }


def test_shared_ai_run_schema_accepts_reviewed_completed_draft():
    schema = json.loads((SCHEMAS / "ai-run.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    assert list(validator.iter_errors(reviewed_ai_run())) == []
