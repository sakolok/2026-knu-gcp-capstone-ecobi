from __future__ import annotations

import json
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .db import get_sql_connection, load_recommendation_tables_for_run
from .models import ModelArtifacts
from .persistence import persist_recommendation_result
from .pipeline import dumps_result, get_meal_conditions, load_model_artifacts, process_recommendation_pipeline


class RecommendationJob(BaseModel):
    run_id: int = Field(alias="runId", gt=0)
    limit: int = Field(default=5, ge=1, le=50)
    skip_models: bool | None = Field(default=None, alias="skipModels")


app = FastAPI(title="Ecobi ML Recommender", version="1.0.0")


@contextmanager
def _timed_stage(timings_ms: dict[str, float], stage: str):
    started_at = time.perf_counter()
    try:
        yield
    finally:
        timings_ms[stage] = round((time.perf_counter() - started_at) * 1000, 2)


def _service_token() -> str | None:
    token = os.environ.get("ML_SERVICE_TOKEN")
    return token if token else None


def _verify_token(authorization: Annotated[str | None, Header()] = None, x_ecobi_ml_token: Annotated[str | None, Header()] = None) -> None:
    expected = _service_token()
    if not expected:
        return

    bearer = f"Bearer {expected}"
    if authorization == bearer or x_ecobi_ml_token == expected:
        return
    raise HTTPException(status_code=401, detail="Invalid ML service token.")


@lru_cache(maxsize=1)
def _engine():
    return get_sql_connection()


@lru_cache(maxsize=1)
def _artifacts(skip_models: bool) -> ModelArtifacts:
    if skip_models:
        return ModelArtifacts(lightfm_data=None, xgboost_model=None)
    model_dir = os.environ.get("ML_MODEL_DIR") or str(Path(__file__).resolve().parents[1])
    return load_model_artifacts(model_dir)


def _skip_models(job: RecommendationJob) -> bool:
    if job.skip_models is not None:
        return job.skip_models
    return os.environ.get("ML_RECOMMENDER_SKIP_MODELS") == "true"


def _mark_run_status(engine, run_id: int, status: str, error_message: str | None = None) -> None:
    sqlalchemy = __import__("sqlalchemy")
    started_expr = "job_started_at = COALESCE(job_started_at, CURRENT_TIMESTAMP)," if status == "running" else ""
    completed_expr = "job_completed_at = CURRENT_TIMESTAMP," if status in {"completed", "failed"} else ""
    with engine.begin() as conn:
        conn.execute(
            sqlalchemy.text(
                f"""
                UPDATE recommendation_runs
                SET job_status = :status,
                    {started_expr}
                    {completed_expr}
                    job_error_message = :error_message
                WHERE run_id = :run_id
                """
            ),
            {
                "status": status,
                "error_message": error_message,
                "run_id": run_id,
            },
        )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "ecobi-ml",
        "skipModels": os.environ.get("ML_RECOMMENDER_SKIP_MODELS") == "true",
    }


@app.post("/recommend", dependencies=[Depends(_verify_token)])
def recommend(job: RecommendationJob) -> dict[str, object]:
    total_started_at = time.perf_counter()
    timings_ms: dict[str, float] = {}
    engine = _engine()
    _mark_run_status(engine, job.run_id, "running")
    try:
        with _timed_stage(timings_ms, "load_tables_ms"):
            all_dfs = load_recommendation_tables_for_run(job.run_id, engine=engine)
        with _timed_stage(timings_ms, "get_conditions_ms"):
            request = get_meal_conditions(job.run_id, all_dfs)
        if request is None:
            raise HTTPException(status_code=404, detail=f"recommendation_run not found: {job.run_id}")

        request = replace(request, limit=job.limit)
        with _timed_stage(timings_ms, "pipeline_ms"):
            result = process_recommendation_pipeline(request, all_dfs, _artifacts(_skip_models(job)), timings_ms=timings_ms)
        with _timed_stage(timings_ms, "persist_ms"):
            result = persist_recommendation_result(engine, job.run_id, result)
        result.timings_ms.update(timings_ms)
        result.timings_ms["total_ms"] = round((time.perf_counter() - total_started_at) * 1000, 2)
        _mark_run_status(engine, job.run_id, "completed")
        print(
            json.dumps({"event": "ml_recommendation_timing", "runId": job.run_id, "timingsMs": result.timings_ms}, ensure_ascii=False),
            file=sys.stderr,
        )
        return json.loads(dumps_result(result))
    except Exception as exc:
        timings_ms["total_ms"] = round((time.perf_counter() - total_started_at) * 1000, 2)
        print(
            json.dumps({"event": "ml_recommendation_timing", "runId": job.run_id, "status": "failed", "timingsMs": timings_ms}, ensure_ascii=False),
            file=sys.stderr,
        )
        _mark_run_status(engine, job.run_id, "failed", str(exc)[:1000])
        raise
