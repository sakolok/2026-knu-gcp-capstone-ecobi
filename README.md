# Ecobi

> GCP 기반 예산 맞춤 식단 추천 서비스

Ecobi는 사용자의 목표 체중, 하루 권장 칼로리, 알레르기, 음식 선호도, 주간 식비 예산을 바탕으로 오늘 선택할 수 있는 식사를 추천하고 기록하는 모바일 웹 애플리케이션입니다. 단순한 칼로리 기록 서비스를 넘어 칼로리, 예산, 선호도 데이터를 함께 반영해 개인화된 식단 추천 흐름을 제공하는 것을 목표로 했습니다.

## Tech Stack

**Frontend**

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

**Backend / ML**

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)

**Google Cloud**

![Firebase Hosting](https://img.shields.io/badge/Firebase%20Hosting-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Cloud Run](https://img.shields.io/badge/Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Cloud SQL](https://img.shields.io/badge/Cloud%20SQL-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Cloud Tasks](https://img.shields.io/badge/Cloud%20Tasks-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Vertex AI Gemini](https://img.shields.io/badge/Vertex%20AI%20Gemini-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Secret Manager](https://img.shields.io/badge/Secret%20Manager-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Cloud Logging](https://img.shields.io/badge/Cloud%20Logging-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Artifact Registry](https://img.shields.io/badge/Artifact%20Registry-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![Cloud Build](https://img.shields.io/badge/Cloud%20Build-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)

## Architecture

![Ecobi GCP Architecture](assets/readme/ecobi-architecture.png)

1. 사용자는 Firebase Hosting으로 배포된 React 모바일 웹에 접속합니다.
2. 프론트엔드는 Firebase rewrite를 통해 Cloud Run API의 `/api/v1/**` 엔드포인트를 호출합니다.
3. Cloud Run API는 `recommendation_runs`를 생성하고 `runId`를 즉시 반환합니다.
4. 무거운 추천 계산은 Cloud Tasks가 Cloud Run ML 서비스의 `/recommend`로 전달합니다.
5. Cloud Run ML은 `run_id` 기준으로 필요한 데이터만 Cloud SQL에서 읽고, MILP 후보 생성, LightFM retrieval, XGBoost rerank, MMR 반복 패널티, macro fit 점수를 반영해 추천 결과를 저장합니다.
6. 사용자는 `runId`로 상태를 polling하고, API는 저장된 추천 결과와 Gemini 기반 설명을 반환합니다.

## 핵심 기여

| Problem | Solution | Result |
|---|---|---|
| 추천 계산이 API 요청 안에서 동기 처리되면 사용자가 25~36초 동안 응답을 기다려야 했습니다. | `recommendation_runs`에 작업 context를 저장하고 `runId`를 즉시 반환한 뒤, Cloud Tasks가 Cloud Run ML 서비스로 추천 작업을 전달하도록 바꿨습니다. | 초기 응답을 0.68초로 줄이고, 사용자는 polling으로 생성 상태와 결과를 확인할 수 있게 했습니다. |
| Node.js API와 Python ML 파이프라인을 한 런타임에 묶으면 의존성, 배포, 스케일링 경계가 불명확해졌습니다. | Cloud Run API와 Cloud Run ML을 분리하고, API는 요청/상태/결과 조회, ML은 추천 계산만 담당하도록 역할을 나눴습니다. | API와 ML 서비스를 독립적으로 배포하고, ML 작업 특성에 맞게 별도 리소스와 concurrency를 적용할 수 있게 했습니다. |
| ML 추천 시 전체 테이블을 읽으면 Cloud SQL 전송량과 DataFrame 생성 비용이 커졌습니다. | `run_id`, 끼니, 예산, 후보군, 최근 사용자 이력 중심으로 필요한 데이터만 읽는 scoped loading 방식으로 바꿨습니다. | ML 데이터 로딩 범위를 20,863 rows에서 1,183 rows로 줄였습니다. |
| 추천 결과만 보여주면 사용자가 왜 해당 식단이 추천됐는지 이해하기 어려웠습니다. | API에서 Vertex AI Gemini를 호출해 추천 설명과 자연어 식단 해석을 제공하도록 연결했습니다. | 추천 결과에 설명 가능성을 더해 사용자가 예산, 칼로리, 선호도 기준을 함께 이해할 수 있게 했습니다. |
| API/ML 병목 구간을 운영 중에 확인하기 어려웠습니다. | Cloud Logging에 API logs와 ML timing logs를 남기고, 단계별 처리 시간을 기록했습니다. | 추천 요청, ML 실행, 결과 저장 과정의 지연 구간을 추적할 수 있게 했습니다. |

## Result

| 개선 영역 | 변경 전 | 변경 후 | 개선 효과 |
|---|---:|---:|---:|
| 추천 요청 초기 응답 | 25~36초 동기 대기 | `runId` 0.68초 응답 후 polling | 약 97~98% 단축 |
| ML 데이터 로딩 범위 | 20,863 rows | 1,183 rows | 약 94.3% 감소 |
| 음식 검색 응답 payload | 4.0MB | 1.7KB | 약 99.96% 감소 |

## Recommendation Pipeline

Ecobi의 추천은 사용자의 끼니, 남은 예산, 남은 칼로리, 음식 선호도, 알레르기 정보를 기반으로 후보 식단을 생성하고 재정렬합니다.

1. API가 `recommendation_runs`에 추천 요청 context를 저장하고 `runId`를 반환합니다.
2. Cloud Tasks가 Cloud Run ML 서비스에 추천 작업을 전달합니다.
3. ML 서비스는 `run_id` 기준으로 필요한 데이터만 Cloud SQL에서 조회합니다.
4. MILP 후보 생성 후 LightFM retrieval, XGBoost rerank, macro fit, MMR 반복 패널티를 반영해 최종 후보를 정렬합니다.
5. 추천 결과는 `recommendation_candidates`에 저장되고, API는 polling 결과와 Gemini 기반 추천 설명을 반환합니다.

## Calorie Calculation

사용자의 신장, 체중, 나이, 성별, 활동량을 기반으로 Mifflin-St Jeor 공식으로 BMR을 계산하고, 활동계수를 곱해 TDEE를 산출합니다.

```text
남성 BMR = 10 × 체중(kg) + 6.25 × 키(cm) - 5 × 나이 + 5
여성 BMR = 10 × 체중(kg) + 6.25 × 키(cm) - 5 × 나이 - 161

TDEE = BMR × 활동계수
```

| 활동 레벨 | 활동계수 |
|---|---:|
| sedentary | 1.2 |
| light | 1.375 |
| moderate | 1.55 |
| active | 1.725 |
| athlete | 1.9 |

```text
감량 목표 = TDEE - 300 kcal
유지 목표 = TDEE
증량 목표 = TDEE + 250 kcal
```

## Data Model

| 테이블 | 역할 |
|---|---|
| `users`, `user_profiles` | 사용자 계정, 목표 체중, 활동량, 주간 예산, 식사 채널 저장 |
| `foods`, `food_logs` | 음식 영양 정보와 사용자의 실제 식단 기록 저장 |
| `meal_candidates`, `meal_candidate_items` | 추천 후보 식단과 후보를 구성하는 음식 목록 저장 |
| `recommendation_runs` | 추천 요청 context, job 상태, dispatcher, 요청 시점 저장 |
| `recommendation_candidates` | ML 추천 결과, 점수, 순위, 선택 여부 저장 |
| `user_item_interactions` | 추천 선택/피드백 기반 개인화 신호 저장 |

## 주요 기능

- 목표 체중, 활동량, 알레르기, 선호/비선호 음식, 주간 예산 기반 온보딩
- 오늘 남은 칼로리, 이번 주 남은 식비, 섭취 영양소를 보여주는 홈 대시보드
- 음식 검색, 직접 입력, 식사 타입 선택을 통한 식단 기록
- 남은 칼로리와 예산을 함께 고려한 식단 추천 및 피드백 저장
- 체중, 체지방률, 골격근량 기록과 변화 추이 확인
- 과식 또는 예산 초과 상황을 위한 회복 루틴 제안

## Screens

| 홈 | 추천 | 기록 |
|---|---|---|
| <img src="assets/readme/home.jpg" width="220" alt="홈 화면" /> | <img src="assets/readme/recommendation.jpg" width="220" alt="추천 화면" /> | <img src="assets/readme/record-sheet.jpg" width="220" alt="기록 선택 화면" /> |

| 회복 | 마이페이지 |
|---|---|
| <img src="assets/readme/recovery.jpg" width="220" alt="회복 화면" /> | <img src="assets/readme/mypage.jpg" width="220" alt="마이페이지 화면" /> |

## Local Development

```bash
npm install
cp .env.example .env
npm run db:seed -- --force
npm run dev
```

기본 주소:

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4000/api/v1`
- Health: `http://127.0.0.1:4000/api/v1/health`

API와 웹을 개별 실행할 수도 있습니다.

```bash
npm run start:api
npm run dev:web
```

## ML Recommender

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

## Quality Check

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment

API와 ML 서비스를 분리해 배포합니다.

```bash
chmod +x deploy-split.sh
./deploy-split.sh
```

프론트엔드는 Firebase Hosting으로 배포합니다.

```bash
chmod +x deploy-frontend-firebase.sh
./deploy-frontend-firebase.sh
```

## Team

<table>
  <tbody>
    <tr>
      <td><strong>강옥일</strong><br/>PM / GCP Architecture / Full-stack<br/>문제 정의, 역할 조율, GCP 배포 아키텍처 설계, API-ML 비동기 연결, 프론트엔드/백엔드 통합 구현</td>
      <td><strong>김민아</strong><br/>Frontend<br/>모바일 웹 화면 구현, 사용자 플로우 구성, React UI 컴포넌트 개발</td>
      <td><strong>최지우</strong><br/>Frontend<br/>모바일 웹 화면 구현, 사용자 플로우 구성, React UI 컴포넌트 개발</td>
    </tr>
    <tr>
      <td><strong>현지민</strong><br/>Backend REST API<br/>REST API 설계, 요청/응답 구조 정리, 백엔드 서비스 로직 구현</td>
      <td><strong>허지환</strong><br/>Database<br/>사용자, 식단, 예산, 추천 데이터 중심의 ERD 및 DB 구조 설계</td>
      <td><strong>김진섭</strong><br/>AI Recommendation<br/>MILP, LightFM, XGBoost, MMR 기반 추천 알고리즘 설계 및 실험</td>
    </tr>
  </tbody>
</table>
