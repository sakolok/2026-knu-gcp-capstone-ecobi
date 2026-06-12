#!/bin/bash

set -e

PROJECT_ID="knu-jerry-kang91558149"
PROJECT_NUMBER="673317980620"
REGION="asia-northeast3"
API_SERVICE_NAME="ecobi-service"
ML_SERVICE_NAME="ecobi-ml-service"
SECRET_NAME="ecobi-db-url"
REPO_NAME="ecobi-repo"
DB_INSTANCE="ecobi-2"
TASK_QUEUE_NAME="ecobi-ml-jobs"
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
BUILD_TAG="$(date +%Y%m%d%H%M%S)"
API_IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ecobi-api:split-${BUILD_TAG}"
ML_IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ecobi-ml:split-${BUILD_TAG}"

echo "=================================================="
echo "    Ecobi API/ML 분리 Cloud Run 배포"
echo "=================================================="
echo " - API 서비스: ${API_SERVICE_NAME}"
echo " - ML 서비스: ${ML_SERVICE_NAME}"
echo " - Region: ${REGION}"
echo " - ML 설정: 4 CPU / 8Gi / concurrency 1 / min instances 1 / timeout 600s"
echo " - 추천 작업 큐: Cloud Tasks ${TASK_QUEUE_NAME}"
echo "=================================================="

read_cloud_run_env_value() {
  local service_name="$1"
  local env_name="$2"
  gcloud run services describe "$service_name" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format=json 2>/dev/null | node -e '
      const envName = process.argv[1];
      let raw = "";
      process.stdin.on("data", (chunk) => { raw += chunk; });
      process.stdin.on("end", () => {
        if (!raw.trim()) return;
        const service = JSON.parse(raw);
        const env = service.spec?.template?.spec?.containers?.[0]?.env ?? [];
        const item = env.find((entry) => entry.name === envName);
        if (item?.value) process.stdout.write(item.value);
      });
    ' "$env_name"
}

if [ -z "$ML_SERVICE_TOKEN" ]; then
  ML_SERVICE_TOKEN="$(read_cloud_run_env_value "$API_SERVICE_NAME" "ML_RECOMMENDER_TOKEN" || true)"
fi

if [ -z "$ML_SERVICE_TOKEN" ]; then
  ML_SERVICE_TOKEN="$(read_cloud_run_env_value "$ML_SERVICE_NAME" "ML_SERVICE_TOKEN" || true)"
fi

if [ -z "$ML_SERVICE_TOKEN" ]; then
  ML_SERVICE_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudtasks.googleapis.com \
  aiplatform.googleapis.com \
  --project="$PROJECT_ID"

if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Ecobi Docker repository" \
    --project="$PROJECT_ID"
fi

if ! gcloud tasks queues describe "$TASK_QUEUE_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud tasks queues create "$TASK_QUEUE_NAME" \
    --location="$REGION" \
    --max-dispatches-per-second=2 \
    --max-concurrent-dispatches=4 \
    --max-attempts=1 \
    --project="$PROJECT_ID"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudtasks.enqueuer" \
  --quiet >/dev/null || echo " -> [경고] Cloud Tasks enqueue 권한 부여를 건너뜁니다. 이미 설정되어 있거나 권한이 부족할 수 있습니다."

echo -e "\n[1/4] API/ML Docker 이미지 빌드 및 업로드..."
gcloud builds submit \
  --config=cloudbuild.split.yaml \
  --substitutions="_API_IMAGE=${API_IMAGE_TAG},_ML_IMAGE=${ML_IMAGE_TAG}" \
  --project="$PROJECT_ID"

echo -e "\n[2/4] ML Cloud Run 배포..."
gcloud run deploy "$ML_SERVICE_NAME" \
  --image="$ML_IMAGE_TAG" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:$DB_INSTANCE" \
  --memory=8Gi \
  --cpu=4 \
  --concurrency=1 \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=600 \
  --set-env-vars="ML_RECOMMENDER_SKIP_MODELS=false,ML_SERVICE_TOKEN=${ML_SERVICE_TOKEN}" \
  --set-secrets="DATABASE_URL=${SECRET_NAME}:latest"

ML_SERVICE_URL="$(gcloud run services describe "$ML_SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"

echo -e "\n[3/4] API Cloud Run 배포..."
gcloud run deploy "$API_SERVICE_NAME" \
  --image="$API_IMAGE_TAG" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --add-cloudsql-instances="$PROJECT_ID:$REGION:$DB_INSTANCE" \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=80 \
  --timeout=300 \
  --set-env-vars="DB_CLIENT=postgres,NODE_ENV=production,HOST=0.0.0.0,SEED_DEV_DATA=false,RECOMMENDATION_ADAPTER=ml,ML_RECOMMENDER_URL=${ML_SERVICE_URL},ML_RECOMMENDER_TIMEOUT_MS=300000,ML_RECOMMENDER_TOKEN=${ML_SERVICE_TOKEN},CLOUD_TASKS_QUEUE_NAME=projects/${PROJECT_ID}/locations/${REGION}/queues/${TASK_QUEUE_NAME},VERTEX_AI_PROJECT_ID=${PROJECT_ID},VERTEX_AI_LOCATION=${REGION},VERTEX_AI_GEMINI_MODEL=gemini-2.5-flash,VERTEX_AI_TIMEOUT_MS=18000,VERTEX_AI_THINKING_BUDGET=0" \
  --set-secrets="DATABASE_URL=${SECRET_NAME}:latest"

API_SERVICE_URL="$(gcloud run services describe "$API_SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"

echo -e "\n[4/4] 배포 결과"
echo " - API URL: ${API_SERVICE_URL}"
echo " - ML URL: ${ML_SERVICE_URL}"
echo " - API image: ${API_IMAGE_TAG}"
echo " - ML image: ${ML_IMAGE_TAG}"
echo "=================================================="
