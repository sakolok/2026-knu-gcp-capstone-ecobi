# Ecobi React + API v1

식단/체중 관리 MVP를 React 프론트와 Express API v1, SQLite 로컬 개발 DB 구조로 리팩토링한 버전입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run db:seed -- --force
npm run dev
```

개별 실행:

```bash
npm run start:api
npm run dev:web
```

기본 URL:

- Frontend: `http://127.0.0.1:5173` 또는 Vite가 안내하는 다음 포트
- API: `http://127.0.0.1:4000/api/v1`
- Health: `http://127.0.0.1:4000/api/v1/health`

## 환경변수

`.env.example` 참고:

- `PORT`: API 서버 포트
- `CLIENT_ORIGIN`: CORS 허용 프론트 origin
- `SQLITE_DB_PATH`: 로컬 SQLite DB 파일 경로
- `VITE_API_BASE_URL`: 프론트 API base path

## DB

- 원본 ERD: [erd_schema_revised.sql](erd_schema_revised.sql)
- 로컬 개발 migration: [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql)
- seed data: [database/seeds/dev-seed.json](database/seeds/dev-seed.json)

현재 로컬 DB는 Node 내장 `node:sqlite` 기반 SQLite 파일을 사용합니다. PostgreSQL ERD 테이블명을 최대한 유지했고, 배열/jsonb 등 PostgreSQL 전용 타입은 로컬 개발용 TEXT JSON으로 변환했습니다.

## 품질 확인

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## ML 추천 연동

추천은 Python ML 파이프라인으로만 동작합니다. 로컬에서 추천 API를 실행하려면 `ML/requirements.txt`를 설치한 Python 경로를 지정하고 `RECOMMENDATION_ADAPTER=ml`을 설정합니다.

```bash
RECOMMENDATION_ADAPTER=ml
ML_PYTHON_PATH=/absolute/path/to/python
```

ML 어댑터는 `recommendation_runs`의 이번 끼니 예산/칼로리를 기준으로 Python `ecobi_recommender` 패키지를 호출합니다. 실패 시 추천 API는 에러를 반환하며 rule-based fallback은 사용하지 않습니다. 자세한 실행 방법은 [ML/README.md](ML/README.md)를 참고하세요.

## GCP 배포

권장 배포는 API Cloud Run과 ML Cloud Run을 분리하는 [deploy-split.sh](deploy-split.sh)를 사용합니다.

```bash
chmod +x deploy-split.sh
./deploy-split.sh
```

분리 배포 구조:

- `ecobi-service`: React 정적 파일과 Express API를 제공하는 API 서비스
- `ecobi-ml-service`: MILP, LightFM, XGBoost, MMR 추천을 실행하는 Python ML 서비스
- API는 `POST /recommendations/jobs`에서 `recommendation_runs`를 만들고 Cloud Tasks 큐에 ML 작업을 등록합니다.
- Cloud Tasks는 `ecobi-ml-service`의 `/recommend` 엔드포인트를 호출하고, ML 서비스가 결과를 DB에 저장합니다.
- ML 서비스는 `4 CPU / 8Gi / concurrency 1 / min instances 1 / timeout 600초`로 배포합니다.

### 프론트엔드 Firebase Hosting 분리

React 프론트는 Firebase Hosting에 정적 파일로 배포할 수 있습니다. Hosting은 `dist/`의 HTML, JS, CSS, font 파일을 CDN에서 제공하고, `/api/v1/**` 요청만 Cloud Run `ecobi-service`로 rewrite합니다.

현재 Hosting URL:

- https://knu-jerry-kang91558149.web.app

```bash
npx firebase-tools login
chmod +x deploy-frontend-firebase.sh
./deploy-frontend-firebase.sh
```

기존 GCP 프로젝트가 아직 Firebase 프로젝트로 전환되지 않았다면 스크립트가 `projects:addfirebase`를 먼저 시도합니다. 이 단계에서 `403 PERMISSION_DENIED`가 발생하면 현재 Firebase 로그인 계정에 필요한 권한이 없거나 Firebase Terms of Service가 수락되지 않은 상태입니다. Firebase Console에서 프로젝트를 Firebase에 추가하고 약관을 수락한 뒤 다시 실행하세요.

설정 파일:

- [firebase.json](firebase.json): Hosting public dir, SPA rewrite, Cloud Run API rewrite, 정적 asset cache 설정
- [.firebaserc](.firebaserc): 기본 Firebase/GCP project 연결

기대 효과:

- React 정적 파일은 Firebase Hosting CDN에서 응답하고 API Cloud Run은 `/api/v1/**` 요청만 처리합니다.
- 해시가 붙은 JS/CSS/font는 장기 캐시하고 `index.html`은 `no-cache`로 유지해 배포 반영성을 보장합니다.
- 프론트 UI 변경은 Firebase Hosting만 배포할 수 있어 API/ML 컨테이너 재배포 리스크를 줄입니다.
- API 이미지는 `SERVE_CLIENT=false`로 실행되어 React `dist/`를 서빙하지 않습니다. API Cloud Run 루트(`/`)는 정적 HTML 대신 API 404를 반환하고, 프론트 진입점은 Firebase Hosting URL을 사용합니다.

API 서비스에는 다음 환경변수가 설정됩니다.

```bash
RECOMMENDATION_ADAPTER=ml
ML_RECOMMENDER_URL=https://...
ML_RECOMMENDER_TIMEOUT_MS=300000
ML_RECOMMENDER_TOKEN=...
CLOUD_TASKS_QUEUE_NAME=projects/.../locations/asia-northeast3/queues/ecobi-ml-jobs
```

ML 서비스에는 다음 환경변수가 설정됩니다.

```bash
ML_RECOMMENDER_SKIP_MODELS=false
ML_SERVICE_TOKEN=...
```

Secret Manager 방식은 배포자 계정에 `secretmanager.secrets.setIamPolicy` 권한이 필요합니다. 권한이 없으면 프로젝트 관리자에게 Cloud Run 서비스 계정의 Secret Accessor 권한 부여를 요청하거나, 임시로 일반 환경변수 방식을 사용하세요.

기존 올인원 배포가 필요하면 [deploy.sh](deploy.sh)를 사용할 수 있습니다. 올인원 이미지는 Node API와 Python ML 런타임을 한 Cloud Run 서비스에 함께 포함합니다.

## 문서

- [API v1 목록](docs/API_V1.md)
- [리팩토링 보고서](docs/MVP_REFACTOR_REPORT.md)

## 포트폴리오 메모

> 기존에는 Express API 서버가 React 정적 파일까지 함께 빌드/서빙해 API Cloud Run이 프론트 트래픽을 같이 처리했다. React 빌드 산출물을 Firebase Hosting으로 분리하고 `/api/v1/**`만 Cloud Run으로 rewrite하도록 구성한 뒤, API 이미지에서는 Vite 빌드와 정적 파일 서빙을 제거했다. 그 결과 정적 asset은 Firebase CDN 캐시로 제공하고, API 컨테이너는 비즈니스 API 처리에만 집중하도록 배포 경계를 분리했다.
