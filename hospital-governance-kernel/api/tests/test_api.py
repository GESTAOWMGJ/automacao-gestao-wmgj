import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import tomllib
import uuid
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import (
    ANALYZE_PATH,
    MAX_BODY_BYTES,
    AnalyzeRequest,
    GovernanceAnalysis,
    Settings,
    body_sha256,
    build_openai_request,
    canonical_input_hash,
    create_app,
    extract_output_text,
    output_schema,
    sign,
    signature_base,
)


SECRET = "test-only-hmac-secret-with-32-bytes-minimum"
EVIDENCE_REF = f"synthetic://sha256/{hashlib.sha256(b'evidence-001').hexdigest()}"


def settings(mode="dry-run"):
    return Settings(
        mode=mode,
        current_key_id="staging-current",
        current_secret=SECRET,
        previous_key_id="staging-previous",
        previous_secret="previous-test-only-secret-with-32-bytes",
        replay_window_seconds=300,
        openai_api_key="sk-test-not-a-real-key" if mode == "active" else "",
        openai_model="gpt-5.6",
        openai_model_allowlist=("gpt-5.6",),
        openai_timeout_seconds=10.0,
    )


def payload(**overrides):
    base = {
        "orgId": "wmgj-sandbox",
        "taskType": "GOVERNANCE_FINDINGS",
        "sensitivity": "RESTRICTED",
        "evidenceRefs": [EVIDENCE_REF],
        "redactedInput": {"competence": "2026-08", "variance": 100, "synthetic": True},
        "promptVersion": "governance-v1",
        "ruleSetVersion": "rules-1.0.0",
        "inputSchemaVersion": 1,
        "outputSchemaVersion": 1,
    }
    base.update(overrides)
    if "inputHash" not in overrides:
        base["inputHash"] = canonical_input_hash(base)
    return base


def signed_headers(body, nonce=None, secret=SECRET, signature_override=None):
    timestamp = str(int(time.time()))
    nonce = nonce or str(uuid.uuid4())
    digest = body_sha256(body)
    signature = sign(secret, signature_base("POST", ANALYZE_PATH, timestamp, nonce, digest))
    return {
        "Content-Type": "application/json",
        "X-Key-Id": "staging-current",
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature_override or signature,
        "X-Correlation-Id": str(uuid.uuid4()),
    }


def valid_analysis():
    return {
        "summary": "Há uma divergência agregada que requer revisão humana.",
        "findings": [
            {
                "code": "BILLING_VARIANCE",
                "domain": "BILLING",
                "title": "Divergência agregada",
                "description": "O valor agregado diverge da referência autorizada.",
                "riskLevel": "HIGH",
                "evidenceRefs": [EVIDENCE_REF],
                "facts": ["A divergência agregada informada é 100."],
                "assumptions": [],
                "recommendedActions": ["Submeter a evidência à revisão humana."],
            }
        ],
        "missingEvidence": [],
        "overallRisk": "HIGH",
        "limitations": ["A entrada contém apenas métricas agregadas."],
        "requiresHumanReview": True,
    }


def completed_upstream(*, output_text=None, content=None, status="completed"):
    if content is None:
        content = [
            {
                "type": "output_text",
                "text": output_text if output_text is not None else json.dumps(valid_analysis()),
            }
        ]
    return {
        "id": "resp_test_001",
        "model": "gpt-5.6",
        "status": status,
        "output": [{"type": "message", "content": content}],
        "usage": {"input_tokens": 11, "output_tokens": 22, "total_tokens": 33, "unexpected": "drop-me"},
    }


def post_json(client, value, **header_overrides):
    body = json.dumps(value, separators=(",", ":")).encode()
    headers = signed_headers(body)
    headers.update(header_overrides)
    return client.post(ANALYZE_PATH, content=body, headers=headers)


def test_health_and_readiness_do_not_expose_secrets():
    client = TestClient(create_app(settings()))
    health = client.get("/healthz")
    ready = client.get("/readyz")
    assert health.status_code == 200
    assert ready.status_code == 200
    assert SECRET not in health.text + ready.text


def test_versioned_hmac_vector_matches_contract():
    vector_path = Path(__file__).resolve().parents[2] / "contracts" / "hmac-vectors.json"
    vector = json.loads(vector_path.read_text(encoding="utf-8"))["vectors"][0]
    digest = body_sha256(vector["body"].encode("utf-8"))
    assert digest == vector["bodySha256"]
    base = signature_base(vector["method"], vector["path"], vector["timestamp"], vector["nonce"], digest)
    assert sign(vector["secret"], base) == vector["signature"]


def test_signed_dry_run_is_structured_and_requires_human_review():
    response = post_json(TestClient(create_app(settings())), payload())
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "dry_run"
    assert data["analysis"]["requiresHumanReview"] is True
    assert data["providerResponseId"] is None


def test_invalid_signature_is_rejected():
    client = TestClient(create_app(settings()))
    body = json.dumps(payload()).encode()
    response = client.post(ANALYZE_PATH, content=body, headers=signed_headers(body, signature_override="0" * 64))
    assert response.status_code == 401
    assert response.json()["detail"] == "SIGNATURE_INVALID"


def test_nonce_replay_is_rejected():
    client = TestClient(create_app(settings()))
    body = json.dumps(payload(), separators=(",", ":")).encode()
    nonce = str(uuid.uuid4())
    headers = signed_headers(body, nonce=nonce)
    assert client.post(ANALYZE_PATH, content=body, headers=headers).status_code == 200
    replay = client.post(ANALYZE_PATH, content=body, headers=headers)
    assert replay.status_code == 409
    assert replay.json()["detail"] == "NONCE_REPLAY"


@pytest.mark.parametrize(
    "injected",
    [
        {"patient_name": "Pessoa Sintética"},
        {"phone": "+55 11 99999-9999"},
        {"address": "Rua Exemplo, 1"},
        {"medical_record": "ABC-123"},
        {"bank_account": "0001/12345-6"},
        {"metadata": {"name": "Pessoa Oculta"}},
    ],
)
def test_redacted_input_allowlist_blocks_pii_bypass_shapes(injected):
    redacted = {"competence": "2026-08", "variance": 100, "synthetic": True, **injected}
    response = post_json(TestClient(create_app(settings())), payload(redactedInput=redacted))
    assert response.status_code == 422
    assert response.json()["detail"] == "REQUEST_CONTRACT_INVALID"


def test_evidence_reference_must_be_an_opaque_sha256_uri():
    bad_ref = f"source://sha256/{'a' * 64}/patient-Maria"
    response = post_json(TestClient(create_app(settings())), payload(evidenceRefs=[bad_ref]))
    assert response.status_code == 422
    assert response.json()["detail"] == "REQUEST_CONTRACT_INVALID"


@pytest.mark.parametrize(
    "mutator",
    [
        lambda value: value["redactedInput"].update({"variance": True}),
        lambda value: value["redactedInput"].update({"documentCount": True}),
        lambda value: value["redactedInput"].update({"requiresAuthorization": 1}),
        lambda value: value.update({"inputSchemaVersion": True}),
    ],
)
def test_strict_contract_rejects_bool_integer_coercion(mutator):
    value = payload()
    value.pop("inputHash")
    mutator(value)
    value["inputHash"] = canonical_input_hash(value)
    response = post_json(TestClient(create_app(settings())), value)
    assert response.status_code == 422
    assert response.json()["detail"] == "REQUEST_CONTRACT_INVALID"


def test_input_hash_covers_every_request_field_except_itself():
    value = payload()
    value["ruleSetVersion"] = "rules-2.0.0"
    response = post_json(TestClient(create_app(settings())), value)
    assert response.status_code == 422
    assert response.json()["detail"] == "INPUT_HASH_MISMATCH"


@pytest.mark.parametrize("weak", ["", "short-secret"])
def test_short_selected_secret_blocks_analyze_even_with_matching_signature(weak):
    client = TestClient(create_app(replace(settings(), current_secret=weak)))
    body = json.dumps(payload(), separators=(",", ":")).encode()
    response = client.post(ANALYZE_PATH, content=body, headers=signed_headers(body, secret=weak))
    assert response.status_code == 503
    assert response.json()["detail"] == "HMAC_CONFIGURATION_INCOMPLETE"


def test_content_length_is_rejected_before_body_processing():
    client = TestClient(create_app(settings()))
    body = json.dumps(payload(), separators=(",", ":")).encode()
    headers = signed_headers(body)
    headers["Content-Length"] = str(MAX_BODY_BYTES + 1)
    response = client.post(ANALYZE_PATH, content=body, headers=headers)
    assert response.status_code == 413
    assert response.json()["detail"] == "PAYLOAD_TOO_LARGE"


def test_clinical_sensitive_input_is_outside_v1_contract():
    response = post_json(TestClient(create_app(settings())), payload(sensitivity="CLINICAL_SENSITIVE"))
    assert response.status_code == 422
    assert response.json()["detail"] == "REQUEST_CONTRACT_INVALID"


def test_openai_request_uses_responses_generated_schema_and_no_storage():
    request = build_openai_request(AnalyzeRequest.model_validate(payload()), "gpt-5.6")
    assert request["store"] is False
    assert request["text"]["format"]["type"] == "json_schema"
    assert request["text"]["format"]["strict"] is True
    assert request["text"]["format"]["schema"] == output_schema()
    assert request["text"]["format"]["schema"]["additionalProperties"] is False
    assert "tools" not in request


def test_active_mode_calls_mocked_responses_api_and_sanitizes_usage():
    captured = {}

    def handler(request):
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["authorization"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=completed_upstream())

    app = create_app(settings("active"), openai_transport=httpx.MockTransport(handler))
    response = post_json(TestClient(app), payload())
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["usage"] == {"input_tokens": 11, "output_tokens": 22, "total_tokens": 33}
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["authorization"] == "Bearer sk-test-not-a-real-key"
    assert captured["body"]["store"] is False
    assert captured["body"]["text"]["format"]["schema"] == output_schema()


@pytest.mark.parametrize(
    ("upstream_status", "expected_detail"),
    [("incomplete", "OPENAI_INCOMPLETE"), ("failed", "OPENAI_FAILED"), ("queued", "OPENAI_STATUS_INVALID")],
)
def test_active_mode_requires_completed_response(upstream_status, expected_detail):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=completed_upstream(status=upstream_status)))
    response = post_json(TestClient(create_app(settings("active"), openai_transport=transport)), payload())
    assert response.status_code == 502
    assert response.json()["detail"] == expected_detail


def test_refusal_is_detected_even_after_output_text():
    content = [
        {"type": "output_text", "text": json.dumps(valid_analysis())},
        {"type": "refusal", "refusal": "cannot comply"},
    ]
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=completed_upstream(content=content)))
    response = post_json(TestClient(create_app(settings("active"), openai_transport=transport)), payload())
    assert response.status_code == 422
    assert response.json()["detail"] == "OPENAI_REFUSAL"


def test_invalid_upstream_http_json_is_handled():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, content=b"not-json", headers={"content-type": "application/json"})
    )
    response = post_json(TestClient(create_app(settings("active"), openai_transport=transport)), payload())
    assert response.status_code == 502
    assert response.json()["detail"] == "OPENAI_RESPONSE_JSON_INVALID"


def test_invalid_structured_output_json_is_handled():
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=completed_upstream(output_text="{not-json"))
    )
    response = post_json(TestClient(create_app(settings("active"), openai_transport=transport)), payload())
    assert response.status_code == 502
    assert response.json()["detail"] == "OPENAI_OUTPUT_JSON_INVALID"


def test_model_cannot_introduce_an_unrequested_evidence_reference():
    analysis = valid_analysis()
    analysis["findings"][0]["evidenceRefs"] = [
        f"source://sha256/{hashlib.sha256(b'unrequested-evidence').hexdigest()}"
    ]
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=completed_upstream(output_text=json.dumps(analysis)))
    )
    response = post_json(TestClient(create_app(settings("active"), openai_transport=transport)), payload())
    assert response.status_code == 502
    assert response.json()["detail"] == "OPENAI_EVIDENCE_REFERENCE_INVALID"


def test_output_contract_requires_evidence_and_coherent_overall_risk():
    without_evidence = valid_analysis()
    without_evidence["findings"][0]["evidenceRefs"] = []
    with pytest.raises(ValidationError):
        GovernanceAnalysis.model_validate(without_evidence)

    understated = valid_analysis()
    understated["overallRisk"] = "LOW"
    with pytest.raises(ValidationError):
        GovernanceAnalysis.model_validate(understated)


def test_output_contract_rejects_extra_fields_and_false_human_review():
    valid = {
        "summary": "Resumo",
        "findings": [],
        "missingEvidence": [],
        "overallRisk": "LOW",
        "limitations": [],
        "requiresHumanReview": True,
    }
    GovernanceAnalysis.model_validate(valid)
    with pytest.raises(ValidationError):
        GovernanceAnalysis.model_validate({**valid, "unexpected": "x"})
    with pytest.raises(ValidationError):
        GovernanceAnalysis.model_validate({**valid, "requiresHumanReview": False})


def test_extraction_scans_all_content_before_returning_text():
    response = completed_upstream(
        content=[
            {"type": "output_text", "text": json.dumps(valid_analysis())},
            {"type": "refusal", "refusal": "blocked"},
        ]
    )
    with pytest.raises(HTTPException) as exc:
        extract_output_text(response)
    assert exc.value.detail == "OPENAI_REFUSAL"


def test_security_logs_do_not_contain_body_or_secret(caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error.hkgk")
    direct_identifier = "Pessoa Privada 12345678900"
    redacted = {
        "competence": "2026-08",
        "variance": 100,
        "synthetic": True,
        "patient_name": direct_identifier,
    }
    value = payload(redactedInput=redacted)
    body = json.dumps(value, separators=(",", ":")).encode()
    headers = signed_headers(body)
    correlation_id = headers["X-Correlation-Id"]
    response = TestClient(create_app(settings())).post(ANALYZE_PATH, content=body, headers=headers)
    assert response.status_code == 422
    rendered = "\n".join(record.getMessage() for record in caplog.records)
    assert "REQUEST_CONTRACT_INVALID" in rendered
    assert direct_identifier not in rendered
    assert SECRET not in rendered
    assert correlation_id not in rendered
    assert hashlib.sha256(correlation_id.encode()).hexdigest()[:16] in rendered


def test_fastapi_cloud_bundle_generates_schema_without_parent_directory(tmp_path):
    api_root = Path(__file__).resolve().parents[1]
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    for name in ("main.py", "pyproject.toml", "uv.lock", ".fastapicloudignore"):
        shutil.copy2(api_root / name, bundle / name)
    assert not (tmp_path / "schemas").exists()
    assert "parents[1]" not in (bundle / "main.py").read_text(encoding="utf-8")

    env = os.environ.copy()
    env["PYTHONPATH"] = str(bundle)
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            "from main import output_schema; s=output_schema(); "
            "assert s['type']=='object'; assert s['additionalProperties'] is False",
        ],
        cwd=bundle,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr


def test_runtime_dependencies_are_minimal_and_standard_is_dev_only():
    api_root = Path(__file__).resolve().parents[1]
    project = tomllib.loads((api_root / "pyproject.toml").read_text(encoding="utf-8"))
    runtime = project["project"]["dependencies"]
    dev = project["dependency-groups"]["dev"]
    assert any(item.startswith("fastapi>=") for item in runtime)
    assert not any(item.startswith("fastapi[standard]") for item in runtime)
    assert any(item.startswith("fastapi[standard]") for item in dev)
