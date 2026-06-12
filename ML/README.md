# Ecobi ML Recommender

이 디렉터리는 노트북 실험 코드를 서비스 호출 가능한 Python 패키지로 분리한 영역입니다.

## 설치

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r ML/requirements.txt
```

## DB 환경변수

`ecobi_recommender`는 코드에 DB 비밀번호를 저장하지 않습니다. 다음 중 하나를 설정합니다.

```bash
DATABASE_URL=postgresql+pg8000://user:password@host:5432/db
```

또는 Cloud SQL Connector:

```bash
CLOUD_SQL_INSTANCE_CONNECTION_NAME=PROJECT:REGION:INSTANCE
DB_USER=postgres
DB_PASSWORD=replace-me
DB_NAME=postgres
CLOUD_SQL_IP_TYPE=PUBLIC
```

## CLI 실행

추천 run을 기준으로 MILP 후보를 생성하고 ML 점수를 저장합니다.

```bash
PYTHONPATH=ML python -m ecobi_recommender --run-id 123 --persist
```

모델 파일 없이 MILP/MMR 중심으로 실행하려면:

```bash
PYTHONPATH=ML python -m ecobi_recommender --run-id 123 --persist --skip-models
```

## 백엔드 연동

Node API에서 ML 추천을 켜려면:

```bash
RECOMMENDATION_ADAPTER=ml
ML_PYTHON_PATH=/absolute/path/to/python
```

ML 실행이 실패하면 백엔드는 추천 API 에러를 반환합니다. rule-based fallback은 사용하지 않습니다.

## Cloud Run

권장 운영 방식은 ML 전용 Cloud Run 서비스입니다. [Dockerfile.ml](Dockerfile.ml)은 Python ML 의존성을 설치하고 FastAPI 서비스로 `/health`, `/recommend`를 제공합니다.

```bash
ML_RECOMMENDER_SKIP_MODELS=false
ML_SERVICE_TOKEN=replace-me
```

API Cloud Run은 `ML_RECOMMENDER_URL`과 `ML_RECOMMENDER_TOKEN`으로 이 서비스를 호출합니다. Secret Manager 배포 모드에서는 Node가 사용하는 `DATABASE_URL`을 Python도 같이 사용합니다. Cloud SQL Unix socket URL은 `ecobi_recommender.db`에서 `pg8000` Unix socket 연결로 변환합니다.
