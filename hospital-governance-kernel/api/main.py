from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import math
import os
import re
import time
from dataclasses import dataclass
from typing import Annotated, Any, Literal, NoReturn

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


LOGGER = logging.getLogger("uvicorn.error.hkgk")
LOGGER.setLevel(logging.INFO)
ANALYZE_PATH = "/internal/v1/governance/analyze"
MAX_BODY_BYTES = 256 * 1024
MIN_HMAC_SECRET_BYTES = 32
EVIDENCE_REF_PATTERN = r"^(synthetic|drive|firestore|source)://sha256/[a-f0-9]{64}$"
RISK_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
SAFE_LOG_FIELDS = {
    "correlationId",
    "errorCode",
    "inputHash",
    "latencyMs",
    "mode",
    "providerResponseId",
    "statusCode",
}
SAFE_LOG_VALUE = re.compile(r"[^A-Za-z0-9._:-]")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


EvidenceRef = Annotated[
    str,
    Field(min_length=1, max_length=96, pattern=EVIDENCE_REF_PATTERN),
]
FiniteNumber = int | float
NonNegativeInt = Annotated[int, Field(ge=0)]


class RedactedInputV1(StrictModel):
    """Allowlisted, aggregate-only input. V1 intentionally has no free-text field."""

    competence: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    variance: FiniteNumber
    synthetic: Literal[True]
    billedAmount: FiniteNumber | None = None
    authorizedAmount: FiniteNumber | None = None
    documentCount: NonNegativeInt | None = None
    exceptionCount: NonNegativeInt | None = None
    requiresAuthorization: bool | None = None
    opme: bool | None = None
    reconciliationState: Literal["MATCHED", "PENDING", "DIVERGENT", "NOT_APPLICABLE"] | None = None

    @field_validator("synthetic", mode="before")
    @classmethod
    def synthetic_is_boolean_true(cls, value: Any) -> Any:
        if type(value) is not bool or value is not True:
            raise ValueError("synthetic must be boolean true")
        return value

    @model_validator(mode="after")
    def numbers_are_finite(self) -> "RedactedInputV1":
        for field_name in ("variance", "billedAmount", "authorizedAmount"):
            value = getattr(self, field_name)
            if value is not None and not math.isfinite(float(value)):
                raise ValueError(f"{field_name} must be finite")
        return self


class AnalyzeRequest(StrictModel):
    orgId: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,63}$")
    taskType: Literal["DOCUMENT_REVIEW", "GOVERNANCE_FINDINGS", "CONTROL_GAP_REVIEW"]
    sensitivity: Literal["PUBLIC", "INTERNAL", "RESTRICTED"]
    evidenceRefs: list[EvidenceRef] = Field(min_length=1, max_length=100)
    inputHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    redactedInput: RedactedInputV1
    promptVersion: Literal["governance-v1"]
    ruleSetVersion: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    inputSchemaVersion: Literal[1]
    outputSchemaVersion: Literal[1]

    @field_validator("inputSchemaVersion", "outputSchemaVersion", mode="before")
    @classmethod
    def versions_are_integer_one(cls, value: Any) -> Any:
        if type(value) is not int or value != 1:
            raise ValueError("schema version must be integer one")
        return value


class Finding(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")
    domain: Literal["DOCUMENT", "CONTRACT", "BILLING", "GLOSS", "OPME", "QUALITY", "RUNTIME", "SECURITY"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    riskLevel: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    evidenceRefs: list[EvidenceRef] = Field(min_length=1, max_length=100)
    facts: list[str] = Field(max_length=30)
    assumptions: list[str] = Field(max_length=30)
    recommendedActions: list[str] = Field(max_length=30)


class GovernanceAnalysis(StrictModel):
    summary: str = Field(min_length=1, max_length=2000)
    findings: list[Finding] = Field(max_length=50)
    missingEvidence: list[str] = Field(max_length=100)
    overallRisk: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    limitations: list[str] = Field(max_length=30)
    requiresHumanReview: Literal[True]

    @field_validator("requiresHumanReview", mode="before")
    @classmethod
    def review_flag_is_boolean_true(cls, value: Any) -> Any:
        if type(value) is not bool or value is not True:
            raise ValueError("requiresHumanReview must be boolean true")
        return value

    @model_validator(mode="after")
    def overall_risk_covers_findings(self) -> "GovernanceAnalysis":
        highest_finding = max((RISK_RANK[item.riskLevel] for item in self.findings), default=0)
        if RISK_RANK[self.overallRisk] < highest_finding:
            raise ValueError("overallRisk cannot be lower than a finding riskLevel")
        return self


class AnalyzeResponse(StrictModel):
    analysis: GovernanceAnalysis
    providerResponseId: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    effectiveModel: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    status: Literal["dry_run", "completed"]
    latencyMs: int = Field(ge=0)
    usage: dict[str, int]
    correlationId: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")


@dataclass(frozen=True)
class Settings:
    mode: Literal["dry-run", "active"]
    current_key_id: str
    current_secret: str
    previous_key_id: str
    previous_secret: str
    replay_window_seconds: int
    shared_idempotency_verified: bool
    openai_api_key: str
    openai_model: str
    openai_model_allowlist: tuple[str, ...]
    openai_timeout_seconds: float

    @classmethod
    def from_env(cls) -> "Settings":
        mode = os.getenv("HKGK_API_MODE", "dry-run").strip().lower()
        if mode not in {"dry-run", "active"}:
            raise RuntimeError("HKGK_API_MODE_INVALID")
        allowlist = tuple(
            item.strip() for item in os.getenv("OPENAI_MODEL_ALLOWLIST", "gpt-5.6").split(",") if item.strip()
        )
        return cls(
            mode=mode,  # type: ignore[arg-type]
            current_key_id=os.getenv("HKGK_INTERNAL_KEY_ID_CURRENT", "staging-current"),
            current_secret=os.getenv("HKGK_INTERNAL_HMAC_CURRENT", ""),
            previous_key_id=os.getenv("HKGK_INTERNAL_KEY_ID_PREVIOUS", ""),
            previous_secret=os.getenv("HKGK_INTERNAL_HMAC_PREVIOUS", ""),
            replay_window_seconds=max(30, min(900, int(os.getenv("HKGK_REPLAY_WINDOW_SECONDS", "300")))),
            shared_idempotency_verified=(
                os.getenv("HKGK_SHARED_IDEMPOTENCY_VERIFIED", "").strip().lower() == "verified"
            ),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-5.6"),
            openai_model_allowlist=allowlist,
            openai_timeout_seconds=max(5.0, min(120.0, float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45")))),
        )


def audit_log(event: str, **fields: Any) -> None:
    record: dict[str, str | int | bool | None] = {"event": event}
    for key, value in fields.items():
        if key not in SAFE_LOG_FIELDS:
            continue
        if isinstance(value, bool) or value is None:
            record[key] = value
        elif isinstance(value, int):
            record[key] = value
        elif isinstance(value, str):
            if key == "correlationId":
                record["correlationIdHash"] = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
            else:
                record[key] = SAFE_LOG_VALUE.sub("_", value)[:128]
    LOGGER.info("%s", json.dumps(record, ensure_ascii=True, sort_keys=True, separators=(",", ":")))


def body_sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def canonical_input_hash(value: BaseModel | dict[str, Any]) -> str:
    if isinstance(value, BaseModel):
        material = value.model_dump(mode="json", exclude_none=True)
    else:
        material = dict(value)
    material.pop("inputHash", None)
    canonical = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def signature_base(method: str, path: str, timestamp: str, nonce: str, digest: str) -> str:
    return "\n".join((method.upper(), path, timestamp, nonce, digest))


def sign(secret: str, base: str) -> str:
    return hmac.new(secret.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()


def select_secret(settings: Settings, key_id: str) -> str:
    if key_id == settings.current_key_id:
        return settings.current_secret
    if key_id and key_id == settings.previous_key_id:
        return settings.previous_secret
    return ""


def _reject_json_constant(value: str) -> NoReturn:
    raise ValueError(f"non-standard JSON constant: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def decode_json_object(value: bytes | str) -> dict[str, Any]:
    decoded = json.loads(value, parse_constant=_reject_json_constant, object_pairs_hook=_unique_object)
    if not isinstance(decoded, dict):
        raise ValueError("JSON root must be an object")
    return decoded


def _clean_schema_node(value: Any) -> Any:
    if isinstance(value, list):
        return [_clean_schema_node(child) for child in value]
    if not isinstance(value, dict):
        return value
    cleaned: dict[str, Any] = {}
    for key, child in value.items():
        if key in {"title", "description", "default"}:
            continue
        if key in {"properties", "$defs"} and isinstance(child, dict):
            cleaned[key] = {name: _clean_schema_node(schema) for name, schema in child.items()}
        else:
            cleaned[key] = _clean_schema_node(child)
    return cleaned


def output_schema() -> dict[str, Any]:
    """Generate the Structured Outputs contract from the runtime Pydantic model."""

    return _clean_schema_node(GovernanceAnalysis.model_json_schema(mode="validation"))


def build_openai_request(payload: AnalyzeRequest, model: str) -> dict[str, Any]:
    instructions = (
        "Analise somente os fatos e referencias agregadas fornecidos. Nao tome decisao clinica, financeira, "
        "contratual ou juridica final. Nao invente evidencias. Separe fatos de suposicoes, declare limitacoes, "
        "referencie ao menos uma evidencia opaca em cada achado e mantenha requiresHumanReview=true. "
        "Retorne apenas a estrutura solicitada."
    )
    user_payload = {
        "taskType": payload.taskType,
        "evidenceRefs": payload.evidenceRefs,
        "input": payload.redactedInput.model_dump(mode="json", exclude_none=True),
        "promptVersion": payload.promptVersion,
        "ruleSetVersion": payload.ruleSetVersion,
        "inputSchemaVersion": payload.inputSchemaVersion,
        "outputSchemaVersion": payload.outputSchemaVersion,
    }
    return {
        "model": model,
        "store": False,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": instructions}]},
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": json.dumps(user_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    }
                ],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "governance_analysis_v1",
                "strict": True,
                "schema": output_schema(),
            }
        },
        "max_output_tokens": 6000,
    }


def extract_output_text(response: dict[str, Any]) -> str:
    status = response.get("status")
    if status == "incomplete":
        raise HTTPException(status_code=502, detail="OPENAI_INCOMPLETE")
    if status == "failed":
        raise HTTPException(status_code=502, detail="OPENAI_FAILED")
    if status != "completed":
        raise HTTPException(status_code=502, detail="OPENAI_STATUS_INVALID")

    output = response.get("output")
    if not isinstance(output, list):
        raise HTTPException(status_code=502, detail="OPENAI_RESPONSE_CONTRACT_INVALID")
    texts: list[str] = []
    refused = False
    for item in output:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        content_items = item.get("content")
        if not isinstance(content_items, list):
            raise HTTPException(status_code=502, detail="OPENAI_RESPONSE_CONTRACT_INVALID")
        for content in content_items:
            if not isinstance(content, dict):
                raise HTTPException(status_code=502, detail="OPENAI_RESPONSE_CONTRACT_INVALID")
            if content.get("type") == "refusal":
                refused = True
            elif content.get("type") == "output_text" and isinstance(content.get("text"), str):
                texts.append(content["text"])
    if refused:
        raise HTTPException(status_code=422, detail="OPENAI_REFUSAL")
    if len(texts) != 1:
        raise HTTPException(status_code=502, detail="OPENAI_OUTPUT_MISSING")
    return texts[0]


def validate_evidence_subset(analysis: GovernanceAnalysis, allowed: set[str]) -> None:
    returned = {ref for finding in analysis.findings for ref in finding.evidenceRefs}
    if not returned.issubset(allowed):
        raise HTTPException(status_code=502, detail="OPENAI_EVIDENCE_REFERENCE_INVALID")


def dry_run_analysis(payload: AnalyzeRequest) -> GovernanceAnalysis:
    return GovernanceAnalysis(
        summary="Análise não executada: serviço em modo dry-run.",
        findings=[],
        missingEvidence=[],
        overallRisk="MEDIUM",
        limitations=["Sem chamada ao modelo; validar o fluxo antes de ativar a integração."],
        requiresHumanReview=True,
    )


def sanitized_usage(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, int] = {}
    for key in ("input_tokens", "output_tokens", "total_tokens"):
        item = value.get(key)
        if isinstance(item, int) and not isinstance(item, bool) and item >= 0:
            result[key] = item
    return result


def create_app(
    settings: Settings | None = None,
    *,
    openai_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    resolved = settings or Settings.from_env()
    app = FastAPI(
        title="WMGJ Governance Analysis Service",
        version="1.1.0",
        description="Serviço interno stateless; não persiste Firestore e não aprova decisões.",
    )
    seen_nonces: dict[str, float] = {}
    nonce_lock = asyncio.Lock()

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": "hkgk-analysis"}

    @app.get("/readyz")
    async def readyz() -> dict[str, str]:
        if resolved.mode == "active":
            if not resolved.shared_idempotency_verified:
                raise HTTPException(status_code=503, detail="ACTIVE_SHARED_IDEMPOTENCY_UNVERIFIED")
            if not resolved.openai_api_key or resolved.openai_model not in resolved.openai_model_allowlist:
                raise HTTPException(status_code=503, detail="ACTIVE_CONFIGURATION_INCOMPLETE")
        if len(resolved.current_secret.encode("utf-8")) < MIN_HMAC_SECRET_BYTES:
            raise HTTPException(status_code=503, detail="HMAC_CONFIGURATION_INCOMPLETE")
        return {"status": "ready", "mode": resolved.mode}

    @app.post(ANALYZE_PATH, response_model=AnalyzeResponse)
    async def analyze(
        request: Request,
        x_key_id: str = Header(alias="X-Key-Id", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$"),
        x_timestamp: str = Header(alias="X-Timestamp", min_length=10, max_length=16, pattern=r"^\d+$"),
        x_nonce: str = Header(alias="X-Nonce", min_length=16, max_length=128, pattern=r"^[A-Za-z0-9._-]+$"),
        x_signature: str = Header(alias="X-Signature", min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$"),
        x_correlation_id: str = Header(
            alias="X-Correlation-Id", min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._-]+$"
        ),
    ) -> AnalyzeResponse:
        started = time.perf_counter()

        def reject(status_code: int, error_code: str) -> NoReturn:
            audit_log(
                "analysis_rejected",
                correlationId=x_correlation_id,
                errorCode=error_code,
                latencyMs=int((time.perf_counter() - started) * 1000),
                statusCode=status_code,
            )
            raise HTTPException(status_code=status_code, detail=error_code)

        declared_length = request.headers.get("content-length")
        if declared_length is not None:
            try:
                parsed_length = int(declared_length)
            except ValueError:
                reject(400, "CONTENT_LENGTH_INVALID")
            if parsed_length < 0:
                reject(400, "CONTENT_LENGTH_INVALID")
            if parsed_length > MAX_BODY_BYTES:
                reject(413, "PAYLOAD_TOO_LARGE")

        try:
            timestamp = int(x_timestamp)
        except ValueError:
            reject(401, "TIMESTAMP_INVALID")
        if abs(int(time.time()) - timestamp) > resolved.replay_window_seconds:
            reject(401, "TIMESTAMP_OUTSIDE_WINDOW")
        known_key_id = x_key_id == resolved.current_key_id or (
            bool(resolved.previous_key_id) and x_key_id == resolved.previous_key_id
        )
        if not known_key_id:
            reject(401, "KEY_ID_INVALID")
        secret = select_secret(resolved, x_key_id)
        if len(secret.encode("utf-8")) < MIN_HMAC_SECRET_BYTES:
            reject(503, "HMAC_CONFIGURATION_INCOMPLETE")

        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            reject(413, "PAYLOAD_TOO_LARGE")
        if declared_length is not None and parsed_length != len(body):
            reject(400, "CONTENT_LENGTH_MISMATCH")
        digest = body_sha256(body)
        expected = sign(secret, signature_base("POST", ANALYZE_PATH, x_timestamp, x_nonce, digest))
        if not hmac.compare_digest(expected, x_signature):
            reject(401, "SIGNATURE_INVALID")

        async with nonce_lock:
            cutoff = time.time() - resolved.replay_window_seconds
            for nonce, observed in list(seen_nonces.items()):
                if observed < cutoff:
                    del seen_nonces[nonce]
            if x_nonce in seen_nonces:
                reject(409, "NONCE_REPLAY")
            seen_nonces[x_nonce] = time.time()

        try:
            raw_payload = decode_json_object(body)
            payload = AnalyzeRequest.model_validate(raw_payload)
        except (ValueError, ValidationError):
            reject(422, "REQUEST_CONTRACT_INVALID")
        if canonical_input_hash(raw_payload) != payload.inputHash:
            reject(422, "INPUT_HASH_MISMATCH")

        if resolved.mode == "dry-run":
            analysis = dry_run_analysis(payload)
            elapsed = int((time.perf_counter() - started) * 1000)
            audit_log(
                "analysis_completed",
                correlationId=x_correlation_id,
                inputHash=payload.inputHash,
                latencyMs=elapsed,
                mode="dry-run",
            )
            return AnalyzeResponse(
                analysis=analysis,
                providerResponseId=None,
                effectiveModel=resolved.openai_model,
                status="dry_run",
                latencyMs=elapsed,
                usage={},
                correlationId=x_correlation_id,
            )

        if not resolved.shared_idempotency_verified:
            reject(503, "ACTIVE_SHARED_IDEMPOTENCY_UNVERIFIED")
        if resolved.openai_model not in resolved.openai_model_allowlist:
            reject(503, "MODEL_NOT_ALLOWLISTED")
        if not resolved.openai_api_key:
            reject(503, "OPENAI_API_KEY_MISSING")
        openai_request = build_openai_request(payload, resolved.openai_model)
        try:
            async with httpx.AsyncClient(
                timeout=resolved.openai_timeout_seconds,
                transport=openai_transport,
            ) as client:
                response = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={"Authorization": f"Bearer {resolved.openai_api_key}", "Content-Type": "application/json"},
                    json=openai_request,
                )
        except httpx.TimeoutException:
            reject(504, "OPENAI_TIMEOUT")
        except httpx.HTTPError:
            reject(502, "OPENAI_NETWORK_ERROR")
        if response.status_code == 429:
            reject(503, "OPENAI_RATE_LIMIT")
        if response.status_code >= 400:
            reject(502, "OPENAI_UPSTREAM_ERROR")
        try:
            upstream = response.json()
        except ValueError:
            reject(502, "OPENAI_RESPONSE_JSON_INVALID")
        if not isinstance(upstream, dict):
            reject(502, "OPENAI_RESPONSE_CONTRACT_INVALID")
        try:
            output_text = extract_output_text(upstream)
        except HTTPException as exc:
            reject(exc.status_code, str(exc.detail))
        try:
            analysis_object = decode_json_object(output_text)
        except ValueError:
            reject(502, "OPENAI_OUTPUT_JSON_INVALID")
        try:
            analysis = GovernanceAnalysis.model_validate(analysis_object)
        except ValidationError:
            reject(502, "OPENAI_OUTPUT_CONTRACT_INVALID")
        try:
            validate_evidence_subset(analysis, set(payload.evidenceRefs))
        except HTTPException as exc:
            reject(exc.status_code, str(exc.detail))

        elapsed = int((time.perf_counter() - started) * 1000)
        raw_provider_id = upstream.get("id")
        provider_id = (
            raw_provider_id
            if isinstance(raw_provider_id, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,128}", raw_provider_id)
            else None
        )
        audit_log(
            "analysis_completed",
            correlationId=x_correlation_id,
            inputHash=payload.inputHash,
            latencyMs=elapsed,
            mode="active",
            providerResponseId=provider_id,
        )
        return AnalyzeResponse(
            analysis=analysis,
            providerResponseId=provider_id,
            effectiveModel=resolved.openai_model,
            status="completed",
            latencyMs=elapsed,
            usage=sanitized_usage(upstream.get("usage")),
            correlationId=x_correlation_id,
        )

    return app


app = create_app()
