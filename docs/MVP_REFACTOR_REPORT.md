# MVP Refactor Report

## 1. 전체 분석 요약

기존 `mvp`는 단일 HTML/CSS/JS 모바일 프로토타입이었고, 상태는 `app.js`의 배열과 전역 state에 들어 있었습니다. 입력, 기록, 추천, 목표 설정은 화면상 동작하지만 실제 API/DB 경계가 없었습니다. 이번 작업에서는 루트에 Vite React 앱과 Express API v1, SQLite 개발 DB를 추가해 실제 서비스 구조로 확장 가능한 형태로 분리했습니다.

API 명세서 파일은 현재 워크스페이스와 첨부 파일 검색에서 별도로 확인되지 않았습니다. 따라서 ERD SQL, `DESIGN.md`, `MVP_ARCHITECTURE.md`, 프롬프트의 핵심 API 목록을 기준으로 구현했습니다.

## 2. 기존 HTML 기능 목록

- 홈 대시보드: 오늘 칼로리, 주간 예산, 추천 식사, 나의 변화
- 추천: 편의점/외식/집밥 식단 후보, 가격/칼로리/영양 표시
- 회복: 과식/외식 후 회복 계획과 회복 식단
- 마이: 목표, 칼로리, 신장/체중, 성별, 나이, 알레르기, 선호/비선호 음식
- 기록: 식단 기록, 체중 기록, 예산 기록, 최근 식단 데이터, 체중 차트
- 모달: 프로필/목표/칼로리/신체/알레르기/식사 확인

## 3. 구현한 백엔드 API 목록

상세 목록은 [API_V1.md](docs/API_V1.md)를 참고하세요.

핵심 그룹:

- 사용자/목표: profile, goals 조회/수정
- 체중 기록: 생성, 목록, 기간 조회, 수정, 삭제, chart, summary
- 식단 기록: 생성, 목록, 날짜/기간/주간 조회, 수정, 삭제, 최근/오늘 조회
- 식단 요약: 오늘/주간/기간 요약, 영양/패턴 요약
- 식단 추천: 목록, 목표 기반 조회, 이유 조회, 선택 저장
- 대시보드: 체중, 목표, 최근 식단, 주간 식단, 추천 통합 조회

## 4. DB 연결 방식

로컬 개발 DB는 Node 내장 `node:sqlite` 기반 SQLite 파일입니다. PostgreSQL ERD의 테이블/컬럼명을 최대한 유지했고, PostgreSQL 전용 타입은 SQLite 개발용 타입으로 변환했습니다.

## 5. 추가한 DB schema/migration/seed 파일

- [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql)
- [database/seeds/dev-seed.json](database/seeds/dev-seed.json)
- [server/database/connection.ts](server/database/connection.ts)
- [server/database/migrate.ts](server/database/migrate.ts)
- [server/database/seed.ts](server/database/seed.ts)

## 6. 변경한 프론트 구조

- `src/pages`: Home, Record, Recommendation, Recover, My
- `src/components`: common, dashboard, weight, meals, recommendation
- `src/services`: API service layer
- `src/api`: API client/envelope 처리
- `src/types`: 프론트 도메인 타입
- `src/styles`: 앱 CSS
- `src/hooks`: 데이터 로딩 hook

## 7. 추가/수정한 컴포넌트 목록

- `MetricCard`
- `SegmentedControl`
- `FoodThumbnail`
- `EmptyState`
- `WeightChart`
- `MealList`
- `RecommendationCard`

## 8. 추가/수정한 service layer 목록

- [src/api/client.ts](src/api/client.ts)
- [src/services/ecobiService.ts](src/services/ecobiService.ts)
- [src/hooks/useEcobiData.ts](src/hooks/useEcobiData.ts)

## 9. 디자인 개선 내용

`DESIGN.md` 기준으로 흰 배경, 절제된 보라색 accent, 녹색/노랑/파랑의 의미별 보조색, 8px 카드 radius, 명확한 숫자 계층, 기능별 섹션 구분으로 정리했습니다. 의미 없는 장식/그라데이션을 제거하고, 카드 크기와 글자 크기를 화면 목적에 맞게 낮췄습니다.

## 10. 체중 변화 화면 개선 내용

홈 첫 화면 최상단에 `나의 변화`를 배치했습니다. 현재 체중, 목표 체중, 최근 변화량, 시작 대비 변화, 최근 기록일, 목표 달성률, 체중 변화 차트를 API 데이터로 표시합니다.

## 11. 식단 기록/기간별 조회 개선 내용

기록 화면에서 체중/식단 모드를 분리했습니다. 식단 모드에는 시작일/종료일 필터, 날짜별 요약, 기간 총 섭취/지출/하루 평균, 기록 리스트, 식단 저장 폼을 연결했습니다.

## 12. 식단 추천 탭 개선 내용

추천 탭을 독립 화면으로 구성하고, 점심/저녁/간식 추천 전환, 추천 이유, 예상 가격/칼로리/단백질, 목표 적합성, 선택 저장 API를 연결했습니다.

## 13. AI 알고리즘 연결 지점

- Interface: [server/services/recommendation/recommendationAdapter.ts](server/services/recommendation/recommendationAdapter.ts)
- Current adapter: [server/services/recommendation/ruleBasedRecommendationAdapter.ts](server/services/recommendation/ruleBasedRecommendationAdapter.ts)
- Orchestrator: [server/services/recommendationService.ts](server/services/recommendationService.ts)

팀원의 AI 알고리즘은 adapter의 `recommend(input)` 구현만 교체하면 됩니다.

## 14. 실행 방법

```bash
npm install
npm run db:seed -- --force
npm run dev
```

## 15. 환경변수 설정 방법

```bash
cp .env.example .env
```

필수 값은 `.env.example`에 있습니다. 기본값으로도 로컬 실행됩니다.

## 16. 빌드/테스트/린트 결과

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm test`: 통과, 2 files / 3 tests
- `npm run build`: 통과
- Browser 확인: Home, Record 식단 기간 조회, Recommendation 탭, responsive 1280/390 viewport 확인, console error 없음

## 17. 남은 TODO

- 실제 PostgreSQL 연결 또는 ORM 도입 시 SQLite migration을 PostgreSQL migration으로 승격
- 인증/사용자 다중 계정 처리
- 예산 기록 API 별도 분리
- 추천 run 중복 생성 정책 정리
- 식단 수정 폼 UI 보강
- API 명세서가 제공되면 endpoint naming과 응답 필드 최종 정렬

## 18. 현재 구현에서 주의해야 할 점

- 현재는 단일 seed 사용자 기준입니다.
- SQLite 개발 DB는 로컬 시연용이며 production DB는 PostgreSQL을 권장합니다.
- API 명세서 파일이 없어서 프롬프트의 요구 API 목록을 기준으로 설계했습니다.
- 식단 추천은 AI가 아니라 seed/rule 기반 adapter입니다.
