# Ecobi

> 남은 칼로리와 이번 주 식비를 함께 고려해 식사를 추천하는 예산 기반 식단 관리 서비스

Ecobi는 사용자의 목표 체중, 하루 권장 칼로리, 알레르기, 음식 선호도, 주간 식비 예산을 바탕으로 오늘 먹을 수 있는 식사를 추천하고 기록하는 모바일 중심 웹 애플리케이션입니다. 단순 칼로리 기록이 아니라 “오늘 얼마나 먹을 수 있는지”와 “이번 주 예산 안에서 무엇을 먹을 수 있는지”를 동시에 보여주는 것을 목표로 했습니다.

- Live Demo: https://knu-jerry-kang91558149.web.app
- API Health: https://ecobi-service-673317980620.asia-northeast3.run.app/api/v1/health

## 주요 기능

- 회원가입/로그인 및 온보딩
  - 목표 체중, 현재 체중, 활동량, 식사 시간, 알레르기, 선호/비선호 음식, 주간 예산을 입력합니다.
- 홈 대시보드
  - 오늘 남은 칼로리, 이번 주 남은 식비, 섭취한 영양소, 최근 식단 기록을 한 화면에서 확인합니다.
- 식단 기록
  - 음식 검색, 직접 입력, 식사 타입 선택을 통해 식단을 기록하고 칼로리와 지출을 누적합니다.
- 예산 기반 식단 추천
  - 남은 칼로리와 남은 식비를 기준으로 추천 후보를 보여주고, 추천 기록/피드백을 저장합니다.
- 체중 및 체성분 기록
  - 체중, 체지방률, 골격근량을 기록하고 변화 추이를 확인합니다.
- 회복 루틴
  - 과식 또는 예산 초과 상황에서 다음 식사와 행동 체크리스트를 제안합니다.
- 주간 식단 계획
  - 한 주 단위의 식단 후보를 생성하고 예산 흐름을 관리합니다.

## 화면 구성

- 시작/온보딩: 사용자 목표와 제약 조건을 수집합니다.
- 홈: 칼로리, 예산, 영양소, 오늘 기록을 요약합니다.
- 추천: 예산 절약, 고단백, 맞춤 추천 등 기준별 식단 후보를 제공합니다.
- 기록: 식단, 체중, 예산을 빠르게 입력합니다.
- 회복: 초과 섭취 또는 예산 초과 이후의 조정 행동을 안내합니다.
- 마이페이지: 목표, 예산, 알레르기, 음식 선호도, 계정 정보를 관리합니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Frontend | React, TypeScript, Vite, CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite for local development, PostgreSQL/Cloud SQL for production |
| ML Recommendation | Python, MILP, MMR, LightFM, XGBoost |
| AI Explanation | Vertex AI Gemini |
| Cloud | Firebase Hosting, Cloud Run, Cloud SQL, Cloud Tasks, Artifact Registry |
| Quality | ESLint, TypeScript, Vitest |

## 아키텍처

```text
Firebase Hosting
  └─ React mobile web app
       └─ /api/v1/** rewrite
            └─ Cloud Run API (Express)
                 ├─ Cloud SQL / PostgreSQL
                 ├─ Vertex AI Gemini
                 └─ Cloud Tasks
                      └─ Cloud Run ML Service
                           └─ Python recommendation pipeline
```

운영 환경에서는 프론트엔드를 Firebase Hosting에 배포하고, API와 ML 추천 서비스를 각각 Cloud Run으로 분리했습니다. API 서버는 사용자/식단/예산/추천 요청을 처리하고, 무거운 추천 계산은 Cloud Tasks를 통해 ML 전용 Cloud Run 서비스로 위임합니다.

## 구현 포인트

- Express API와 React UI를 분리하면서도 로컬 개발에서는 SQLite로 빠르게 실행할 수 있도록 구성했습니다.
- 운영 DB는 PostgreSQL/Cloud SQL을 사용하고, 로컬 DB와 운영 DB의 쿼리 호환성을 테스트로 검증합니다.
- 추천 요청은 동기 API 호출만으로 처리하지 않고 `recommendation_runs`와 Cloud Tasks 기반 작업 흐름으로 분리했습니다.
- ML 추천 파이프라인은 Node 서버에 직접 묶지 않고 Python 패키지와 별도 Cloud Run 서비스로 분리했습니다.
- 민감 정보는 `.env`에만 두고, GitHub에는 `.env.example`만 포함합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run db:seed -- --force
npm run dev
```

기본 주소:

- Frontend: http://127.0.0.1:5173
- API: http://127.0.0.1:4000/api/v1
- Health: http://127.0.0.1:4000/api/v1/health

개별 실행:

```bash
npm run start:api
npm run dev:web
```

## 품질 확인

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## ML 추천 로컬 실행

추천 API를 Python ML 파이프라인과 연결하려면 Python 의존성을 설치하고 ML 어댑터를 활성화합니다.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r ML/requirements.txt
```

`.env` 예시:

```bash
RECOMMENDATION_ADAPTER=ml
ML_PYTHON_PATH=/absolute/path/to/python
```

자세한 내용은 [ML/README.md](ML/README.md)를 참고하세요.

## 배포

API와 ML 서비스를 분리해 배포하는 방식을 권장합니다.

```bash
chmod +x deploy-split.sh
./deploy-split.sh
```

프론트엔드는 Firebase Hosting으로 배포합니다.

```bash
chmod +x deploy-frontend-firebase.sh
./deploy-frontend-firebase.sh
```

## 문서

- [API v1 목록](docs/API_V1.md)
- [리팩토링 보고서](docs/MVP_REFACTOR_REPORT.md)
- [ML 추천 모듈](ML/README.md)
