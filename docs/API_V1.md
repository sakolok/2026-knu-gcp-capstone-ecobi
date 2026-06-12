# Ecobi API v1

Base URL: `/api/v1`

응답 형식:

```json
{
  "success": true,
  "data": {},
  "message": "요청이 성공했습니다."
}
```

에러 형식:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값이 올바르지 않습니다."
  }
}
```

## Health

- `GET /health`

## 사용자/목표

- `GET /users/me/profile`
- `GET /users/me/goals`
- `PATCH /users/me/goals`

## 체중 기록

- `GET /weights`
- `GET /weights?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `POST /weights`
- `PATCH /weights/:id`
- `DELETE /weights/:id`
- `GET /weights/chart`
- `GET /weights/summary`

## 식단 기록

- `GET /meals`
- `GET /meals?date=YYYY-MM-DD`
- `GET /meals?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `POST /meals`
- `PATCH /meals/:id`
- `DELETE /meals/:id`
- `GET /meals/today`
- `GET /meals/recent`
- `GET /meals/weekly`

## 식단 요약

- `GET /meals/summary`
- `GET /meals/summary?date=YYYY-MM-DD`
- `GET /meals/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

## 식단 추천

- `GET /recommendations?mealType=dinner`
- `GET /recommendations/goals?mealType=dinner`
- `GET /recommendations/:id/reason`
- `POST /recommendations/:id/select`

추천 알고리즘은 `server/services/recommendation/recommendationAdapter.ts` 인터페이스 뒤에 분리되어 있습니다. 현재 구현체는 `ruleBasedRecommendationAdapter.ts`입니다.

## 대시보드

- `GET /dashboard`

## 카탈로그

- `GET /catalog/foods`
